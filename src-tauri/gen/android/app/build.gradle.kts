import java.io.File
import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("rust")
}

val tauriProperties = Properties().apply {
    val propFile = file("tauri.properties")
    if (propFile.exists()) {
        propFile.inputStream().use { load(it) }
    }
}

android {
    compileSdk = 36
    namespace = "com.zzaoclub.zotepad"
    defaultConfig {
        manifestPlaceholders["usesCleartextTraffic"] = "true"
        applicationId = "com.zzaoclub.zotepad"
        minSdk = 24
        targetSdk = 36
        versionCode = tauriProperties.getProperty("tauri.android.versionCode", "1").toInt()
        versionName = tauriProperties.getProperty("tauri.android.versionName", "1.0")
    }

    var releaseSigningConfigured = false
    signingConfigs {
        create("release") {
            val envStorePath = System.getenv("ANDROID_KEYSTORE_PATH")?.takeIf { it.isNotBlank() }
            if (envStorePath != null) {
                val envStoreFile = File(envStorePath)
                if (envStoreFile.exists()) {
                    storeFile = envStoreFile
                    storePassword = System.getenv("ANDROID_STORE_PASSWORD")
                    keyAlias = System.getenv("ANDROID_KEY_ALIAS")
                    keyPassword = System.getenv("ANDROID_KEY_PASSWORD")
                    releaseSigningConfigured = true
                    println("Configured release signing from ANDROID_KEYSTORE_PATH=${envStoreFile.absolutePath}")
                } else {
                    println("ANDROID_KEYSTORE_PATH is set but file not found at ${envStoreFile.absolutePath}")
                }
            }

            if (!releaseSigningConfigured) {
                val candidateFiles = listOf(
                    rootProject.file("keystore.properties"),
                    rootProject.file("../keystore.properties"),
                    rootProject.file("../../keystore.properties")
                )
                val keystoreFile = candidateFiles.firstOrNull { it.exists() }
                if (keystoreFile != null) {
                    val props = Properties()
                    props.load(keystoreFile.inputStream())
                    keyAlias = props.getProperty("keyAlias")
                    keyPassword = props.getProperty("keyPassword")
                    val storePath = props.getProperty("storeFile") ?: ""
                    val resolvedStoreFile = File(storePath).let { candidate ->
                        if (candidate.isAbsolute) candidate else File(keystoreFile.parentFile, storePath)
                    }
                    storeFile = resolvedStoreFile
                    storePassword = props.getProperty("storePassword")
                    releaseSigningConfigured = true
                    println("Configured release signing from ${keystoreFile.absolutePath}")
                } else {
                    println("Release keystore not found in expected locations, skipping signing config")
                }
            }
        }
    }

    buildTypes {
        getByName("debug") {
            manifestPlaceholders["usesCleartextTraffic"] = "true"
            isDebuggable = true
            isJniDebuggable = true
            isMinifyEnabled = false
            packaging {                jniLibs.keepDebugSymbols.add("*/arm64-v8a/*.so")
                jniLibs.keepDebugSymbols.add("*/armeabi-v7a/*.so")
                jniLibs.keepDebugSymbols.add("*/x86/*.so")
                jniLibs.keepDebugSymbols.add("*/x86_64/*.so")
            }
        }
        getByName("release") {
            if (releaseSigningConfigured) {
                signingConfig = signingConfigs.getByName("release")
            }
            isMinifyEnabled = false
            proguardFiles(
                *fileTree(".") { include("**/*.pro") }
                    .plus(getDefaultProguardFile("proguard-android-optimize.txt"))
                    .toList().toTypedArray()
            )
        }
    }
    kotlinOptions {
        jvmTarget = "1.8"
    }
    buildFeatures {
        buildConfig = true
    }
}

rust {
    rootDirRel = "../../../"
}

dependencies {
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("com.google.android.material:material:1.12.0")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.4")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.0")
}

apply(from = "tauri.build.gradle.kts")