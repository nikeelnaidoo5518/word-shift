package com.wordshift.tv;

import android.app.Activity;
import android.app.AlertDialog;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.view.inputmethod.InputMethodManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

/** TV launcher for the hosted Firebase game. No computer or server address is required. */
public final class MainActivity extends Activity {
    private static final String GAME_BASE = "https://nikeelnaidoo5518.github.io/word-shift/";
    private WebView web;
    private FrameLayout root;
    private LinearLayout overlay;
    private boolean failedLoad;

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        immersive();
        root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(36,24,19));setContentView(root);
        openGame();
    }
    private int dp(int value) {return Math.round(value * getResources().getDisplayMetrics().density);}
    private void immersive() {getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);}
    @Override public void onWindowFocusChanged(boolean focused) {super.onWindowFocusChanged(focused);if(focused)immersive();}
    private void message(String copy, boolean retry) {
        if(overlay!=null)root.removeView(overlay);
        overlay=new LinearLayout(this);overlay.setOrientation(LinearLayout.VERTICAL);overlay.setGravity(Gravity.CENTER);overlay.setPadding(dp(48),dp(28),dp(48),dp(28));overlay.setBackgroundColor(Color.rgb(36,24,19));
        TextView title=new TextView(this);title.setText("WORD SHIFT");title.setTextSize(34);title.setTextColor(Color.rgb(245,199,107));overlay.addView(title);
        TextView text=new TextView(this);text.setText(copy);text.setTextSize(19);text.setGravity(Gravity.CENTER);text.setTextColor(Color.rgb(235,221,199));text.setPadding(0,dp(18),0,dp(18));overlay.addView(text);
        if(retry){Button button=new Button(this);button.setText("TRY AGAIN");overlay.addView(button,new LinearLayout.LayoutParams(dp(240),dp(56)));button.setOnClickListener(v->openGame());button.requestFocus();}
        root.addView(overlay,new FrameLayout.LayoutParams(-1,-1));
    }
    private void openGame() {
        disposeWebView();
        try {web=new WebView(this);}catch(RuntimeException e){message("Update your TV software to enable Android System WebView.",true);return;}
        web.setBackgroundColor(Color.rgb(36,24,19));web.setFocusable(true);web.setFocusableInTouchMode(true);
        WebSettings settings=web.getSettings();settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);settings.setUseWideViewPort(true);settings.setSupportZoom(false);
        settings.setAllowFileAccess(false);settings.setAllowContentAccess(false);settings.setJavaScriptCanOpenWindowsAutomatically(false);settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);settings.setMediaPlaybackRequiresUserGesture(true);
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){return !allowed(request.getUrl().toString());}
            @Override public void onPageStarted(WebView view,String url,android.graphics.Bitmap icon){if(view==web){failedLoad=false;message("Getting your game ready…\nKeep this TV online while phones play.",false);}}
            @Override public void onPageFinished(WebView view,String url){if(view==web && !failedLoad && overlay!=null){root.removeView(overlay);overlay=null;web.requestFocus();}}
            @Override public void onReceivedError(WebView view,WebResourceRequest request,WebResourceError error){if(view==web && request.isForMainFrame()){failedLoad=true;message("Could not open the game. Check your TV’s internet connection, then try again.",true);}}
            @Override public void onReceivedHttpError(WebView view,WebResourceRequest request,WebResourceResponse response){if(view==web && request.isForMainFrame()){failedLoad=true;message("The game website is not ready yet. Check your connection and try again shortly.",true);}}
        });
        root.addView(web,0,new FrameLayout.LayoutParams(-1,-1));message("Getting your game ready…",false);web.loadUrl(GAME_BASE+"?tv=1");
    }
    private boolean allowed(String value) {
        try {java.net.URI uri=new java.net.URI(value);return "https".equalsIgnoreCase(uri.getScheme()) && "nikeelnaidoo5518.github.io".equalsIgnoreCase(uri.getHost()) && (uri.getPort()==-1 || uri.getPort()==443) && uri.getRawUserInfo()==null && uri.getPath().startsWith("/word-shift/");}catch(Exception e){return false;}
    }
    @Override public boolean dispatchKeyEvent(KeyEvent event) {
        if(web!=null && overlay==null){
            int key=event.getKeyCode();
            if(key==KeyEvent.KEYCODE_MENU && event.getAction()==KeyEvent.ACTION_UP){showMenu();return true;}
            String direction=key==KeyEvent.KEYCODE_DPAD_LEFT?"ArrowLeft":key==KeyEvent.KEYCODE_DPAD_RIGHT?"ArrowRight":key==KeyEvent.KEYCODE_DPAD_UP?"ArrowUp":key==KeyEvent.KEYCODE_DPAD_DOWN?"ArrowDown":key==KeyEvent.KEYCODE_DPAD_CENTER || key==KeyEvent.KEYCODE_ENTER?"Enter":null;
            if(direction!=null){
                if(event.getAction()==KeyEvent.ACTION_DOWN)web.evaluateJavascript("window.wordShiftRemote ? window.wordShiftRemote('"+direction+"') : null",result->{if("\"edit\"".equals(result) && web!=null)((InputMethodManager)getSystemService(INPUT_METHOD_SERVICE)).showSoftInput(web,InputMethodManager.SHOW_IMPLICIT);});
                return true;
            }
        }
        return super.dispatchKeyEvent(event);
    }
    @Override public void onBackPressed(){showMenu();}
    private void showMenu(){new AlertDialog.Builder(this).setTitle("WORD SHIFT TV").setItems(new String[]{"Resume game","Reload / reconnect","Exit app"},(dialog,which)->{if(which==1)openGame();if(which==2)finish();}).show();}
    private void disposeWebView(){WebView old=web;web=null;if(old!=null){old.stopLoading();if(old.getParent() instanceof android.view.ViewGroup)((android.view.ViewGroup)old.getParent()).removeView(old);old.destroy();}}
    @Override protected void onDestroy(){disposeWebView();super.onDestroy();}
}
