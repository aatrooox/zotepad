package com.zzaoclub.zotepad

import android.os.Bundle
import android.view.WindowManager

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    // Ensure the window is allowed to receive IME input.
    window.clearFlags(WindowManager.LayoutParams.FLAG_ALT_FOCUSABLE_IM)
    window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
  }
}
