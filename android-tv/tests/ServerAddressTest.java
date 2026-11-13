import com.wordshift.tv.ServerAddress;
public final class ServerAddressTest {
    public static void main(String[] args) {
        equal("http://192.168.1.20:4173/", ServerAddress.normalize("192.168.1.20:4173"));
        equal("https://game.example/", ServerAddress.normalize("https://GAME.example"));
        equal("http://[2001:db8::1]:4173/", ServerAddress.normalize("http://[2001:db8::1]:4173"));
        for (String value : new String[]{"", "javascript:alert(1)", "file:///tmp/game", "https://user:secret@example.com", "http://localhost:4173", "http://127.0.0.1:4173", "https://game.example/path", "https://game.example?token=secret", "https://game.example/#x", "http://game.example:70000", "http://game.example:0", "http://game.example:-2"}) {
            try { ServerAddress.normalize(value); throw new AssertionError("Accepted invalid address: " + value); }
            catch (IllegalArgumentException expected) { }
        }
        if (!ServerAddress.sameOrigin("https://game.example/", "https://game.example:443/?tv=1")) throw new AssertionError("Default port");
        for (String value : new String[]{"http://game.example", "https://game.example.attacker.invalid", "javascript:alert(1)", "https://game.example:444", "https://user@game.example"}) {
            if (ServerAddress.sameOrigin("https://game.example/", value)) throw new AssertionError("Allowed different origin");
        }
        System.out.println("PASS: server addresses, invalid schemes/credentials/paths/ports, and origin navigation boundaries");
    }
    private static void equal(String expected, String actual) { if (!expected.equals(actual)) throw new AssertionError(actual); }
}
