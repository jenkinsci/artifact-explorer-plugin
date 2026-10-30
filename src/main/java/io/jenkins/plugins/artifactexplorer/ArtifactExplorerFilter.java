package io.jenkins.plugins.artifactexplorer;

import hudson.Extension;
import jakarta.servlet.RequestDispatcher;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import jenkins.util.HttpServletFilter;

/**
 * Makes the classic {@code <build>/artifact/<dir>/} and {@code /userContent/<dir>/} URLs show the explorer instead of
 * the built-in directory listing.
 *
 * <p>Only directory page loads from a browser are taken over. File downloads, {@code *zip*}, {@code *view*},
 * {@code *fingerprint*} and any request with {@code ?legacy=1} fall through to core's
 * {@link hudson.model.DirectoryBrowserSupport}, which keeps serving the actual bytes (with its CSP and symlink
 * handling).
 */
@Extension
public class ArtifactExplorerFilter implements HttpServletFilter {

    /**
     * {@code <view/job prefix>/<build number or permalink>/artifact/<dir>/}; group 1 is the build URL, group 2 the
     * directory below the artifact root. Directory requests always end in a slash; anything containing a {@code *}
     * (core's special tokens) is excluded.
     */
    static final Pattern DIRECTORY_REQUEST =
            Pattern.compile("^((?:/(?:view|job)/[^/]+)+/(?:\\d+|last[A-Za-z]*Build))/artifact/((?:[^/*]+/)*)$");

    /**
     * {@code /userContent/<dir>/}; group 1 is the directory below {@code userContent}. Directory requests always end in
     * a slash; anything containing a {@code *} (core's special tokens) is excluded.
     */
    static final Pattern USER_CONTENT_DIRECTORY_REQUEST = Pattern.compile("^/userContent/((?:[^/*]+/)*)$");

    /**
     * Job or build overview pages where classic "Last Successful Artifacts" or "Build Artifacts" summary lists are
     * rendered.
     */
    static final Pattern SUMMARY_PAGE_REQUEST =
            Pattern.compile("^(?:/(?:view|job)/[^/]+)+(?:|/(?:\\d+|last[A-Za-z]*Build))/?$");

    /**
     * Fingerprint pages ({@code /fingerprint/<md5>/} or {@code .../*fingerprint*\/}).
     */
    static final Pattern FINGERPRINT_PAGE_REQUEST =
            Pattern.compile("^(?:/fingerprint/[a-fA-F0-9]+|/.+/\\*fingerprint\\*)/?$");

    @Override
    public boolean handle(HttpServletRequest req, HttpServletResponse rsp) throws IOException, ServletException {
        if (!isBrowserGet(req) || "1".equals(req.getParameter("legacy"))) {
            return false;
        }
        ExplorerConfiguration config = ExplorerConfiguration.get();
        if (config == null || !config.isReplaceClassicBrowser()) {
            return false;
        }
        String path = req.getRequestURI().substring(req.getContextPath().length());
        Matcher m = DIRECTORY_REQUEST.matcher(path);
        if (m.matches()) {
            req.setAttribute(ArtifactExplorerAction.PATH_ATTRIBUTE, decode(m.group(2)));
            RequestDispatcher dispatcher = req.getRequestDispatcher(m.group(1) + "/artifact-explorer/");
            if (dispatcher == null) {
                return false;
            }
            dispatcher.forward(req, rsp);
            return true;
        }
        Matcher uc = USER_CONTENT_DIRECTORY_REQUEST.matcher(path);
        if (uc.matches()) {
            req.setAttribute(ArtifactExplorerAction.PATH_ATTRIBUTE, decode(uc.group(1)));
            RequestDispatcher dispatcher = req.getRequestDispatcher("/userContent-explorer/");
            if (dispatcher == null) {
                return false;
            }
            dispatcher.forward(req, rsp);
            return true;
        }
        if (FINGERPRINT_PAGE_REQUEST.matcher(path).matches()) {
            req.setAttribute(ArtifactSummaryDecorator.PAGE_KIND_ATTRIBUTE, ArtifactSummaryDecorator.KIND_FINGERPRINT);
        } else if (SUMMARY_PAGE_REQUEST.matcher(path).matches()) {
            req.setAttribute(ArtifactSummaryDecorator.PAGE_KIND_ATTRIBUTE, ArtifactSummaryDecorator.KIND_SUMMARY);
        }
        return false;
    }

    private static boolean isBrowserGet(HttpServletRequest req) {
        if (!"GET".equals(req.getMethod())) {
            return false;
        }
        String accept = req.getHeader("Accept");
        return accept != null && accept.contains("text/html");
    }

    private static String decode(String rawPath) {
        try {
            return java.net.URLDecoder.decode(rawPath.replace("+", "%2B"), StandardCharsets.UTF_8);
        } catch (IllegalArgumentException e) {
            return "";
        }
    }
}
