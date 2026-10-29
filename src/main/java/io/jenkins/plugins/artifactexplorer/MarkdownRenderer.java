package io.jenkins.plugins.artifactexplorer;

import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.commonmark.Extension;
import org.commonmark.ext.autolink.AutolinkExtension;
import org.commonmark.ext.gfm.strikethrough.StrikethroughExtension;
import org.commonmark.ext.gfm.tables.TablesExtension;
import org.commonmark.ext.heading.anchor.HeadingAnchorExtension;
import org.commonmark.ext.ins.InsExtension;
import org.commonmark.node.AbstractVisitor;
import org.commonmark.node.HtmlBlock;
import org.commonmark.node.HtmlInline;
import org.commonmark.node.Node;
import org.commonmark.parser.Parser;
import org.commonmark.renderer.html.HtmlRenderer;

/**
 * Renders Markdown content to safe HTML using the CommonMark library provided by the
 * {@code markdown-formatter} plugin, preserving safe embedded HTML tags while sanitizing
 * executable scripts and dangerous attributes.
 */
final class MarkdownRenderer {

    private static final List<Extension> EXTENSIONS = List.of(
            TablesExtension.create(),
            AutolinkExtension.create(),
            StrikethroughExtension.create(),
            InsExtension.create(),
            HeadingAnchorExtension.create());

    private static final Parser PARSER = Parser.builder().extensions(EXTENSIONS).build();

    private static final HtmlRenderer RENDERER = HtmlRenderer.builder()
            .extensions(EXTENSIONS)
            .escapeHtml(false)
            .sanitizeUrls(true)
            .build();

    private static final Set<String> ALLOWED_TAGS = Set.of(
            "h1",
            "h2",
            "h3",
            "h4",
            "h5",
            "h6",
            "p",
            "div",
            "span",
            "br",
            "hr",
            "b",
            "i",
            "u",
            "s",
            "strong",
            "em",
            "small",
            "sub",
            "sup",
            "ins",
            "del",
            "mark",
            "abbr",
            "cite",
            "dfn",
            "kbd",
            "q",
            "samp",
            "var",
            "time",
            "code",
            "pre",
            "blockquote",
            "ul",
            "ol",
            "li",
            "dl",
            "dt",
            "dd",
            "table",
            "thead",
            "tbody",
            "tfoot",
            "tr",
            "th",
            "td",
            "caption",
            "colgroup",
            "col",
            "details",
            "summary",
            "figure",
            "figcaption",
            "picture",
            "a",
            "img");

    private static final Set<String> ALLOWED_ATTRS = Set.of(
            "id",
            "class",
            "title",
            "align",
            "width",
            "height",
            "colspan",
            "rowspan",
            "open",
            "alt",
            "dir",
            "lang",
            "start",
            "type",
            "reversed",
            "scope",
            "headers",
            "datetime",
            "cite",
            "abbr",
            "href",
            "src");

    private static final Pattern COMPLETE_HTML_BLOCK_LINE =
            Pattern.compile("^\\s*<([a-zA-Z][a-zA-Z0-9:-]*)\\b[^>]*>.*</\\1>\\s*$|^\\s*<(?:hr|br)\\b[^>]*/?>\\s*$");

    private static final Pattern FENCE_LINE = Pattern.compile("^\\s*(?:```|~~~)");

    private static final Pattern HTML_TAG_PATTERN =
            Pattern.compile("<(/?)([a-zA-Z][a-zA-Z0-9:-]*)([^>]*?)(/?)>|<!--[\\s\\S]*?-->|<[^>]*>");

    private static final Pattern ATTR_PATTERN =
            Pattern.compile("([a-zA-Z_:][a-zA-Z0-9_.:-]*)(?:\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s\"'=<>`]+)))?");

    private MarkdownRenderer() {}

    static boolean isMarkdownPath(String path) {
        if (path == null) {
            return false;
        }
        String lower = path.toLowerCase(Locale.ROOT);
        return lower.endsWith(".md") || lower.endsWith(".markdown");
    }

    static String render(String markdown) {
        if (markdown == null || markdown.isEmpty()) {
            return "";
        }
        Node document = PARSER.parse(separateSingleLineHtmlBlocks(markdown));
        document.accept(new SafeHtmlVisitor());
        return RENDERER.render(document);
    }

    /**
     * CommonMark Type 6 HTML blocks continue until a blank line, which would otherwise swallow a Markdown line
     * immediately following a single-line HTML element (such as {@code <h1>Title</h1>\n### Sub title}). Inserting a
     * blank line after complete single-line HTML elements lets the next line be parsed as Markdown.
     */
    private static String separateSingleLineHtmlBlocks(String markdown) {
        String[] lines = markdown.split("\n", -1);
        StringBuilder out = new StringBuilder(markdown.length() + 16);
        boolean inFence = false;
        for (int i = 0; i < lines.length; i++) {
            String line = lines[i];
            String trimmed = line.endsWith("\r") ? line.substring(0, line.length() - 1) : line;
            if (FENCE_LINE.matcher(trimmed).find()) {
                inFence = !inFence;
            }
            out.append(line);
            if (i < lines.length - 1) {
                out.append('\n');
                if (!inFence && COMPLETE_HTML_BLOCK_LINE.matcher(trimmed).matches()) {
                    String next = lines[i + 1].trim();
                    if (!next.isEmpty() && !next.startsWith("<")) {
                        out.append('\n');
                    }
                }
            }
        }
        return out.toString();
    }

    private static final class SafeHtmlVisitor extends AbstractVisitor {
        @Override
        public void visit(HtmlBlock htmlBlock) {
            htmlBlock.setLiteral(sanitizeHtmlFragment(htmlBlock.getLiteral()));
        }

        @Override
        public void visit(HtmlInline htmlInline) {
            htmlInline.setLiteral(sanitizeHtmlFragment(htmlInline.getLiteral()));
        }
    }

    static String sanitizeHtmlFragment(String raw) {
        if (raw == null || raw.isEmpty()) {
            return "";
        }
        StringBuilder sb = new StringBuilder(raw.length());
        Matcher matcher = HTML_TAG_PATTERN.matcher(raw);
        int lastEnd = 0;
        while (matcher.find()) {
            if (matcher.start() > lastEnd) {
                sb.append(raw, lastEnd, matcher.start());
            }
            String closingSlash = matcher.group(1);
            String tagName = matcher.group(2);
            String attrsRaw = matcher.group(3);
            String selfClosingSlash = matcher.group(4);

            if (tagName == null) {
                String match = matcher.group(0);
                if (!match.startsWith("<!--")) {
                    sb.append(escapeHtml(match));
                }
            } else {
                String lowerTag = tagName.toLowerCase(Locale.ROOT);
                if (!ALLOWED_TAGS.contains(lowerTag)) {
                    sb.append(escapeHtml(matcher.group(0)));
                } else if ("/".equals(closingSlash)) {
                    sb.append("</").append(lowerTag).append('>');
                } else {
                    sb.append('<').append(lowerTag);
                    appendSanitizedAttributes(sb, lowerTag, attrsRaw);
                    if ("/".equals(selfClosingSlash)) {
                        sb.append(" /");
                    }
                    sb.append('>');
                }
            }
            lastEnd = matcher.end();
        }
        if (lastEnd < raw.length()) {
            sb.append(raw, lastEnd, raw.length());
        }
        return sb.toString();
    }

    private static void appendSanitizedAttributes(StringBuilder sb, String tag, String attrsRaw) {
        if (attrsRaw == null || attrsRaw.isBlank()) {
            return;
        }
        Matcher attrMatcher = ATTR_PATTERN.matcher(attrsRaw);
        while (attrMatcher.find()) {
            String attrName = attrMatcher.group(1).toLowerCase(Locale.ROOT);
            if (attrName.startsWith("on") || !ALLOWED_ATTRS.contains(attrName)) {
                continue;
            }
            if ("src".equals(attrName) && !"img".equals(tag)) {
                continue;
            }
            if ("href".equals(attrName) && !"a".equals(tag)) {
                continue;
            }
            String val = attrMatcher.group(2);
            if (val == null) {
                val = attrMatcher.group(3);
            }
            if (val == null) {
                val = attrMatcher.group(4);
            }
            if ("href".equals(attrName) || "src".equals(attrName)) {
                if (val == null || !isSafeUrl(val)) {
                    continue;
                }
            }
            sb.append(' ').append(attrName);
            if (val != null) {
                sb.append("=\"").append(escapeAttribute(val)).append('"');
            }
        }
    }

    private static boolean isSafeUrl(String url) {
        String trimmed = url.trim().toLowerCase(Locale.ROOT);
        StringBuilder stripped = new StringBuilder(trimmed.length());
        for (int i = 0; i < trimmed.length(); i++) {
            char c = trimmed.charAt(i);
            if (c > 0x20) {
                stripped.append(c);
            }
        }
        String normalized = stripped.toString();
        return !normalized.startsWith("javascript:")
                && !normalized.startsWith("vbscript:")
                && !normalized.startsWith("data:");
    }

    private static String escapeHtml(String s) {
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }

    private static String escapeAttribute(String s) {
        return escapeHtml(s).replace("\"", "&quot;").replace("'", "&#39;");
    }
}
