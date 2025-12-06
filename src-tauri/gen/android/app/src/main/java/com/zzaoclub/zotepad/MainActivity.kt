package com.zzaoclub.zotepad

import android.os.Bundle
import android.view.View
import android.view.WindowManager
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    // Ensure keyboard resizes the webview instead of overlaying it
    window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
    // Allow content to draw behind system bars; we'll handle insets manually
    WindowCompat.setDecorFitsSystemWindows(window, false)
    // Apply IME insets as bottom padding to the root view (works with full-screen gestures)
    val rootView: View = window.decorView
    ViewCompat.setOnApplyWindowInsetsListener(rootView) { v, insets ->
      val imeInsets = insets.getInsets(WindowInsetsCompat.Type.ime())
      v.setPadding(v.paddingLeft, v.paddingTop, v.paddingRight, imeInsets.bottom)
      insets
    }
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }
}
