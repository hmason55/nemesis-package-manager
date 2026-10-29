package dev.nemesis.usbmanager;

import android.app.Activity;
import android.app.Dialog;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.ColorDrawable;
import android.view.View;
import android.view.Window;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

/** Own every dialog color: OEM dialog themes can otherwise hide light body text. */
final class ManagerDialogs {
    static final int BACKGROUND = Color.rgb(20, 24, 30);
    static final int PANEL = Color.rgb(38, 45, 55);
    static final int TEXT = Color.rgb(235, 238, 244);
    private ManagerDialogs() { }
    private static int dp(Activity activity, int value) {
        return Math.round(value * activity.getResources().getDisplayMetrics().density);
    }
    static Dialog show(final Activity activity, String title, String body, String positive,
                       final Runnable confirmed, String secondary, final Runnable secondaryAction) {
        final Dialog dialog = new Dialog(activity);
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);
        dialog.setTitle(title);
        LinearLayout root = new LinearLayout(activity);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(activity, 20), dp(activity, 16), dp(activity, 20), dp(activity, 16));
        root.setBackgroundColor(BACKGROUND);
        TextView heading = new TextView(activity);
        heading.setText(title); heading.setTextSize(22); heading.setTextColor(TEXT);
        heading.setMaxLines(2); heading.setEllipsize(android.text.TextUtils.TruncateAt.END);
        heading.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        heading.setPadding(0, 0, 0, dp(activity, 12));
        root.addView(heading);
        final int maxBodyHeight = Math.max(dp(activity, 80), activity.getResources().getDisplayMetrics().heightPixels - dp(activity, 190));
        ScrollView scroll = new ScrollView(activity) {
            @Override protected void onMeasure(int widthSpec, int heightSpec) {
                super.onMeasure(widthSpec, View.MeasureSpec.makeMeasureSpec(maxBodyHeight, View.MeasureSpec.AT_MOST));
            }
        };
        scroll.setBackgroundColor(BACKGROUND);
        TextView text = new TextView(activity);
        text.setText(body == null || body.trim().length() == 0 ? "No additional information." : body);
        text.setTextColor(TEXT); text.setBackgroundColor(BACKGROUND); text.setTextSize(17);
        text.setTextIsSelectable(true); text.setPadding(0, 0, 0, dp(activity, 16));
        scroll.addView(text);
        root.addView(scroll, new LinearLayout.LayoutParams(-1, -2));
        LinearLayout buttons = new LinearLayout(activity);
        buttons.setGravity(android.view.Gravity.RIGHT);
        if (secondary != null) {
            Button other = button(activity, secondary);
            other.setOnClickListener(new View.OnClickListener() {
                public void onClick(View view) { if (secondaryAction != null) secondaryAction.run(); }
            });
            buttons.addView(other, new LinearLayout.LayoutParams(0, dp(activity, 52), 1));
        }
        if (confirmed != null) {
            Button cancel = button(activity, "Cancel");
            cancel.setOnClickListener(new View.OnClickListener() { public void onClick(View view) { dialog.dismiss(); } });
            buttons.addView(cancel, new LinearLayout.LayoutParams(0, dp(activity, 52), 1));
        }
        Button ok = button(activity, positive);
        ok.setBackgroundColor(Color.rgb(25, 99, 137));
        ok.setOnClickListener(new View.OnClickListener() {
            public void onClick(View view) {
                dialog.dismiss();
                if (confirmed != null) confirmed.run();
            }
        });
        boolean multipleActions = secondary != null || confirmed != null;
        LinearLayout.LayoutParams positiveLayout = new LinearLayout.LayoutParams(multipleActions ? 0 : -2, dp(activity, 52), multipleActions ? 1 : 0);
        positiveLayout.leftMargin = dp(activity, 12);
        buttons.addView(ok, positiveLayout);
        root.addView(buttons, new LinearLayout.LayoutParams(-1, -2));
        dialog.setContentView(root);
        dialog.setCanceledOnTouchOutside(false);
        dialog.show();
        Window window = dialog.getWindow();
        if (window != null) {
            window.setBackgroundDrawable(new ColorDrawable(BACKGROUND));
            window.setLayout(Math.min(activity.getResources().getDisplayMetrics().widthPixels - dp(activity, 32), dp(activity, 760)), -2);
        }
        return dialog;
    }
    private static Button button(Activity activity, String label) {
        Button button = new Button(activity);
        button.setText(label); button.setAllCaps(false); button.setTextColor(TEXT);
        button.setBackgroundColor(PANEL); button.setPadding(dp(activity, 16), 0, dp(activity, 16), 0);
        return button;
    }
}
