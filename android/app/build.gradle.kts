import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
}

// Khoá ký bản phát hành nằm NGOÀI repo (repo công khai): ~/.megatech/android-release.jks, mật khẩu trong local.properties.
val localProps = Properties().apply { rootProject.file("local.properties").takeIf { it.exists() }?.inputStream()?.use { load(it) } }

android {
    namespace = "vn.megatech.tonghoppos"
    compileSdk = 37

    defaultConfig {
        applicationId = "vn.megatech.tonghoppos"
        minSdk = 26
        targetSdk = 37
        versionCode = 1
        versionName = "0.1"
    }
    signingConfigs {
        create("release") {
            val path = localProps.getProperty("megatech.keystore")
            if (path != null) {
                storeFile = file(path)
                storePassword = localProps.getProperty("megatech.storePassword")
                keyAlias = localProps.getProperty("megatech.keyAlias")
                keyPassword = localProps.getProperty("megatech.keyPassword")
            }
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.getByName("release")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures { compose = true; buildConfig = true }
}

dependencies {
    val bom = platform("androidx.compose:compose-bom:2026.09.00")
    implementation(bom)
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended:1.7.8")
    implementation("androidx.activity:activity-compose:1.13.0")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.11.0")
    implementation("androidx.biometric:biometric:1.1.0")
    implementation("com.squareup.okhttp3:okhttp:5.5.0")
}
