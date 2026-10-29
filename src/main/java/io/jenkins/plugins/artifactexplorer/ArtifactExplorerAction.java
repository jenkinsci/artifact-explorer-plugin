package io.jenkins.plugins.artifactexplorer;

import edu.umd.cs.findbugs.annotations.CheckForNull;
import hudson.Extension;
import hudson.Functions;
import hudson.model.Action;
import hudson.model.RootAction;
import hudson.model.Run;
import hudson.util.HttpResponses;
import java.io.File;
import java.io.IOException;
import jenkins.model.Jenkins;
import jenkins.util.VirtualFile;
import net.sf.json.JSONArray;
import net.sf.json.JSONObject;
import org.kohsuke.accmod.Restricted;
import org.kohsuke.accmod.restrictions.NoExternalUse;
import org.kohsuke.stapler.HttpResponse;
import org.kohsuke.stapler.QueryParameter;
import org.kohsuke.stapler.Stapler;
import org.kohsuke.stapler.StaplerRequest2;
import org.kohsuke.stapler.verb.GET;

/**
 * The explorer page for one build (or controller {@code /userContent/}), plus the small JSON API its script uses.
 *
 * <p>Served at {@code <build>/artifact-explorer/} (and {@code /userContent-explorer/}). {@link ArtifactExplorerFilter}
 * forwards classic {@code <build>/artifact/<dir>/} and {@code /userContent/<dir>/} requests here so the old URL shows
 * the explorer.
 */
public class ArtifactExplorerAction implements Action {

    /** Request attribute carrying the directory the browser originally asked for. */
    static final String PATH_ATTRIBUTE = ArtifactExplorerAction.class.getName() + ".path";

    /** Maximum number of bytes returned by {@link #doPreview(String)}. */
    static final int MAX_PREVIEW_BYTES = 128 * 1024;

    /** Largest file {@link #doSha256(String)} will hash, so one request cannot tie up the controller for long. */
    static final long MAX_SHA256_BYTES = 1024L * 1024 * 1024;

    @CheckForNull
    private final Run<?, ?> run;

    public ArtifactExplorerAction(@CheckForNull Run<?, ?> run) {
        this.run = run;
    }

    @CheckForNull
    public Run<?, ?> getRun() {
        return run;
    }

    @CheckForNull
    @Restricted(NoExternalUse.class) // for Jelly
    public Run<?, ?> getObject() {
        return getRun();
    }

    @Override
    public String getIconFileName() {
        // Only show the sidebar entry when there is something to explore.
        return run != null && run.getHasArtifacts() ? "symbol-cube" : null;
    }

    @Override
    public String getDisplayName() {
        return Messages.ArtifactExplorerAction_DisplayName();
    }

    @Override
    public String getUrlName() {
        return "artifact-explorer";
    }

    /** Directory to show initially: set by the filter, or given as {@code ?path=} when visited directly. */
    public String getInitialPath() {
        StaplerRequest2 req = Stapler.getCurrentRequest2();
        if (req == null) {
            return "";
        }
        Object forwarded = req.getAttribute(PATH_ATTRIBUTE);
        String raw = forwarded != null ? forwarded.toString() : req.getParameter("path");
        try {
            return ArtifactTree.sanitize(raw);
        } catch (IllegalArgumentException e) {
            return "";
        }
    }

    /** URL of the build page, with a trailing slash and the context path. */
    public String getBuildUrl() {
        StaplerRequest2 req = Stapler.getCurrentRequest2();
        String ctx = req != null ? req.getContextPath() : "";
        if (run == null) {
            return ctx + "/";
        }
        return ctx + "/" + run.getUrl();
    }

    /** URL of the raw artifact / directory root ({@code <build>/artifact/} or {@code /userContent/}). */
    public String getArtifactRootUrl() {
        StaplerRequest2 req = Stapler.getCurrentRequest2();
        String ctx = req != null ? req.getContextPath() : "";
        if (run == null) {
            return ctx + "/userContent/";
        }
        return ctx + "/" + run.getUrl() + "artifact/";
    }

    /** URL of the JSON API / explorer endpoint ({@code <build>/artifact-explorer/} or {@code /userContent-explorer/}). */
    public String getExplorerRootUrl() {
        StaplerRequest2 req = Stapler.getCurrentRequest2();
        String ctx = req != null ? req.getContextPath() : "";
        if (run == null) {
            return ctx + "/" + getUrlName() + "/";
        }
        return ctx + "/" + run.getUrl() + getUrlName() + "/";
    }

    public int getMaxEntries() {
        return ExplorerConfiguration.get().getMaxEntries();
    }

    @CheckForNull
    protected VirtualFile root() {
        if (run != null) {
            return run.getArtifactManager().root();
        }
        return VirtualFile.forFile(new File(Jenkins.get().getRootDir(), "userContent"));
    }

    protected void checkAccess() {
        if (run == null) {
            Jenkins.get().checkPermission(Jenkins.READ);
            return;
        }
        if (Functions.isArtifactsPermissionEnabled()) {
            run.checkPermission(Run.ARTIFACTS);
        } else {
            run.checkPermission(hudson.model.Item.READ);
        }
    }

    /** {@code GET tree?path=a/b}: direct children of a directory. */
    @GET
    public HttpResponse doTree(@QueryParameter String path) throws IOException {
        checkAccess();
        ArtifactTree.Listing<ArtifactTree.Entry> listing;
        try {
            listing = ArtifactTree.children(root(), path, getMaxEntries());
        } catch (IllegalArgumentException e) {
            return HttpResponses.errorJSON("Invalid path");
        }
        if (listing == null) {
            return HttpResponses.errorJSON("Not a directory");
        }
        JSONArray items = new JSONArray();
        for (ArtifactTree.Entry e : listing.items()) {
            JSONObject o = new JSONObject();
            o.put("name", e.name());
            o.put("path", e.path());
            o.put("directory", e.directory());
            o.put("size", e.size());
            o.put("lastModified", e.lastModified());
            items.add(o);
        }
        JSONObject data = new JSONObject();
        data.put("entries", items);
        data.put("truncated", listing.truncated());
        return HttpResponses.okJSON(data);
    }

    /** {@code GET searchIndex}: every file path in the build, for client side search. */
    @GET
    public HttpResponse doSearchIndex() throws IOException {
        checkAccess();
        ArtifactTree.Listing<String> listing = ArtifactTree.allFiles(root(), getMaxEntries());
        JSONObject data = new JSONObject();
        data.put("files", JSONArray.fromObject(listing.items()));
        data.put("truncated", listing.truncated());
        return HttpResponses.okJSON(data);
    }

    /** {@code GET preview?path=a/b.txt}: metadata, bounded UTF-8 text preview, and optional CommonMark HTML. */
    @GET
    public HttpResponse doPreview(@QueryParameter String path) throws IOException {
        checkAccess();
        ArtifactTree.FilePreview preview;
        try {
            preview = ArtifactTree.preview(root(), path, MAX_PREVIEW_BYTES);
        } catch (IllegalArgumentException e) {
            return HttpResponses.errorJSON("Invalid path");
        }
        if (preview == null) {
            return HttpResponses.errorJSON("Not a file");
        }
        JSONObject data = new JSONObject();
        data.put("name", preview.name());
        data.put("path", preview.path());
        data.put("size", preview.size());
        data.put("lastModified", preview.lastModified());
        data.put("binary", preview.binary());
        data.put("truncated", preview.truncated());
        if (preview.text() != null) {
            data.put("text", preview.text());
        }
        if (preview.renderedHtml() != null) {
            data.put("renderedHtml", preview.renderedHtml());
        }
        return HttpResponses.okJSON(data);
    }

    /** {@code GET sha256?path=a/b.txt}: lowercase SHA-256 hex digest of a single file. */
    @GET
    public HttpResponse doSha256(@QueryParameter String path) throws IOException {
        checkAccess();
        String hash;
        try {
            hash = ArtifactTree.sha256(root(), path, MAX_SHA256_BYTES);
        } catch (IllegalArgumentException e) {
            return HttpResponses.errorJSON("Invalid path");
        } catch (ArtifactTree.TooLargeException e) {
            return HttpResponses.errorJSON("File is too large to hash (limit 1 GiB)");
        }
        if (hash == null) {
            return HttpResponses.errorJSON("Not a file");
        }
        JSONObject data = new JSONObject();
        data.put("sha256", hash);
        return HttpResponses.okJSON(data);
    }

    /**
     * Root action backing the {@code <jenkinsurl>/userContent/} directory browser replacement.
     */
    @Extension
    public static final class UserContentExplorerAction extends ArtifactExplorerAction implements RootAction {

        public UserContentExplorerAction() {
            super(null);
        }

        @Override
        public String getIconFileName() {
            return null;
        }

        @Override
        public String getDisplayName() {
            return Messages.UserContentExplorerAction_DisplayName();
        }

        @Override
        public String getUrlName() {
            return "userContent-explorer";
        }
    }
}
