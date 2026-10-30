package io.jenkins.plugins.artifactexplorer;

import hudson.Extension;
import hudson.model.Job;
import hudson.model.PageDecorator;
import hudson.model.Run;
import org.kohsuke.stapler.Stapler;
import org.kohsuke.stapler.StaplerRequest2;

/**
 * Injects client-side scripts to progressively enhance classic artifact summaries
 * (e.g. "Last Successful Artifacts" on Job pages and "Build Artifacts" on Build pages)
 * and fingerprint pages when marked by {@link ArtifactExplorerFilter}.
 */
@Extension
public final class ArtifactSummaryDecorator extends PageDecorator {

    static final String PAGE_KIND_ATTRIBUTE = ArtifactSummaryDecorator.class.getName() + ".pageKind";
    static final String KIND_FINGERPRINT = "fingerprint";
    static final String KIND_SUMMARY = "summary";

    public ArtifactSummaryDecorator() {
        super();
    }

    public boolean isEnabled() {
        ExplorerConfiguration cfg = ExplorerConfiguration.get();
        if (cfg != null && !cfg.isReplaceClassicBrowser()) {
            return false;
        }
        StaplerRequest2 req = Stapler.getCurrentRequest2();
        if (req == null) {
            return false;
        }
        Object kind = req.getAttribute(PAGE_KIND_ATTRIBUTE);
        if (KIND_FINGERPRINT.equals(kind)) {
            return true;
        }
        if (KIND_SUMMARY.equals(kind)) {
            Run<?, ?> run = req.findAncestorObject(Run.class);
            if (run != null) {
                return run.getHasArtifacts();
            }
            Job<?, ?> job = req.findAncestorObject(Job.class);
            if (job != null) {
                Run<?, ?> lastSuccessful = job.getLastSuccessfulBuild();
                return lastSuccessful != null && lastSuccessful.getHasArtifacts();
            }
        }
        return false;
    }
}
