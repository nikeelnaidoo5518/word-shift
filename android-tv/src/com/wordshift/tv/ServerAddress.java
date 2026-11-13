package com.wordshift.tv;

import java.net.URI;
import java.net.URISyntaxException;

/** Only an explicit HTTP(S) server origin can be opened; never arbitrary URL schemes. */
public final class ServerAddress {
    public static String normalize(String value) {
        String input = value == null ? "" : value.trim();
        if (input.isEmpty()) throw new IllegalArgumentException("Enter the game server address.");
        if (!input.contains("://")) input = "http://" + input;
        try {
            URI uri = new URI(input);
            String scheme = uri.getScheme();
            String host = uri.getHost();
            int port = uri.getPort();
            if (!("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme))
                    || host == null || uri.getRawUserInfo() != null
                    || port == 0 || port > 65535
                    || uri.getRawQuery() != null || uri.getRawFragment() != null
                    || !(uri.getPath() == null || uri.getPath().isEmpty() || "/".equals(uri.getPath()))) {
                throw new IllegalArgumentException("Use the server address only, such as http://192.168.1.20:4173");
            }
            if ("localhost".equalsIgnoreCase(host) || host.equals("127.0.0.1") || host.equals("[::1]")) {
                throw new IllegalArgumentException("Use your computer's Wi-Fi address; localhost refers to the TV.");
            }
            return new URI(scheme.toLowerCase(java.util.Locale.ROOT), null, host.toLowerCase(java.util.Locale.ROOT), port, "/", null, null).toASCIIString();
        } catch (URISyntaxException e) {
            throw new IllegalArgumentException("Enter a valid game server address.");
        }
    }
    public static boolean sameOrigin(String base, String target) {
        try {
            URI a = new URI(base), b = new URI(target);
            return a.getScheme().equalsIgnoreCase(b.getScheme()) && a.getHost().equalsIgnoreCase(b.getHost()) && port(a) == port(b) && b.getRawUserInfo() == null;
        } catch (Exception e) { return false; }
    }
    private static int port(URI uri) { return uri.getPort() == -1 ? ("https".equalsIgnoreCase(uri.getScheme()) ? 443 : 80) : uri.getPort(); }
}
