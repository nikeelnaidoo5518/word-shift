package com.wordshift.tv;

import android.app.Activity;
import android.app.AlertDialog;
import android.graphics.Color;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.view.inputmethod.InputMethodManager;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;

public final class MainActivity extends Activity {
    private WebView web;
    private String origin;
    private EditText address;
    private TextView status;

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        showSetup(null);
    }
    private int dp(int n) { return Math.round(n * getResources().getDisplayMetrics().density); }
    private void showSetup(String message) {
        disposeWebView();
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setPadding(dp(48), dp(28), dp(48), dp(28));
        layout.setBackgroundColor(Color.rgb(36, 24, 19));
        TextView title = new TextView(this);
        title.setText("WORD SHIFT"); title.setTextSize(34); title.setTextColor(Color.rgb(245, 199, 107));
        layout.addView(title);
        TextView help = new TextView(this);
        help.setText("Connect to your game server\nRun npm start on a computer on the same Wi-Fi. Enter its phone address below.\nPlayers open that address on their phones. A hosted server can also be used.");
        help.setTextSize(17); help.setTextColor(Color.rgb(235, 221, 199)); help.setPadding(0, dp(12), 0, dp(14));
        layout.addView(help);
        address = new EditText(this);
        address.setSingleLine(true); address.setTextSize(20); address.setTextColor(Color.WHITE);
        address.setHintTextColor(Color.LTGRAY); address.setHint("http://192.168.1.20:4173");
        address.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_URI);
        address.setText(getPreferences(MODE_PRIVATE).getString("server", ""));
        layout.addView(address, new LinearLayout.LayoutParams(-1, dp(56)));
        Button open = new Button(this); open.setText("OPEN GAME");
        layout.addView(open, new LinearLayout.LayoutParams(-1, dp(56)));
        status = new TextView(this); status.setTextSize(15); status.setTextColor(Color.rgb(245, 199, 107));
        status.setText(message == null ? "Use arrows and OK to navigate. Back opens the TV menu.\nThe server must stay running during play." : message);
        layout.addView(status);
        open.setOnClickListener(v -> {
            try {
                origin = ServerAddress.normalize(address.getText().toString());
                getPreferences(MODE_PRIVATE).edit().putString("server", origin).apply();
                openGame();
            } catch (IllegalArgumentException e) { status.setText(e.getMessage()); address.requestFocus(); }
        });
        setContentView(layout);
        if (address.getText().length() == 0) address.requestFocus(); else open.requestFocus();
    }
    private void openGame() {
        ((InputMethodManager)getSystemService(INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(address.getWindowToken(), 0);
        try { web = new WebView(this); }
        catch (RuntimeException e) { showSetup("This device needs a working Android System WebView. Update the TV software and try again."); return; }
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true); settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false); settings.setAllowContentAccess(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(true);
        web.setBackgroundColor(Color.rgb(36, 24, 19));
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !ServerAddress.sameOrigin(origin, request.getUrl().toString());
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) runOnUiThread(() -> { if (view == web) showSetup("Could not reach the game. Check the address, Wi-Fi, and that npm start is still running."); });
            }
            @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                if (request.isForMainFrame()) runOnUiThread(() -> { if (view == web) showSetup("The server returned HTTP " + response.getStatusCode() + ". Check the game server address."); });
            }
        });
        setContentView(web); web.requestFocus(); web.loadUrl(origin + "?tv=1");
    }
    @Override public boolean dispatchKeyEvent(KeyEvent event) {
        if (web != null) {
            int key = event.getKeyCode();
            if (key == KeyEvent.KEYCODE_MENU && event.getAction() == KeyEvent.ACTION_UP) { showMenu(); return true; }
            String direction = key == KeyEvent.KEYCODE_DPAD_LEFT ? "ArrowLeft" : key == KeyEvent.KEYCODE_DPAD_RIGHT ? "ArrowRight" : key == KeyEvent.KEYCODE_DPAD_UP ? "ArrowUp" : key == KeyEvent.KEYCODE_DPAD_DOWN ? "ArrowDown" : key == KeyEvent.KEYCODE_DPAD_CENTER || key == KeyEvent.KEYCODE_ENTER ? "Enter" : null;
            if (direction != null) {
                if (event.getAction() == KeyEvent.ACTION_DOWN) {
                    web.evaluateJavascript("window.wordShiftRemote ? window.wordShiftRemote('" + direction + "') : null", result -> {
                        if ("\"edit\"".equals(result) && web != null) ((InputMethodManager)getSystemService(INPUT_METHOD_SERVICE)).showSoftInput(web, InputMethodManager.SHOW_IMPLICIT);
                    });
                }
                return true;
            }
        }
        return super.dispatchKeyEvent(event);
    }
    @Override public void onBackPressed() { if (web != null) showMenu(); else super.onBackPressed(); }
    private void showMenu() {
        new AlertDialog.Builder(this).setTitle("WORD SHIFT TV")
            .setItems(new String[]{"Resume game", "Reload / reconnect", "Change server", "Exit app"}, (dialog, which) -> {
                if (which == 1 && web != null) web.reload();
                if (which == 2) showSetup(null);
                if (which == 3) finish();
            }).show();
    }
    private void disposeWebView() {
        WebView old = web; web = null;
        if (old != null) {
            old.stopLoading();
            if (old.getParent() instanceof android.view.ViewGroup) ((android.view.ViewGroup)old.getParent()).removeView(old);
            old.destroy();
        }
    }
    @Override protected void onDestroy() { disposeWebView(); super.onDestroy(); }
}
