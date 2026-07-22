import java.util.Properties
import org.gradle.api.GradleException

plugins {
    id("com.android.application")
    id("kotlin-android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

if (file("google-services.json").exists()) {
    apply(plugin = "com.google.gms.google-services")
} else {
    logger.lifecycle(
        "google-services.json is not present; Firebase push is disabled for this build.",
    )
}

val keyProperties = Properties()
val keyPropertiesFile = rootProject.file("key.properties")
if (keyPropertiesFile.exists()) {
    keyPropertiesFile.inputStream().use(keyProperties::load)
}

fun signingValue(propertyName: String, environmentName: String): String? =
    keyProperties.getProperty(propertyName)?.takeIf { it.isNotBlank() }
        ?: System.getenv(environmentName)?.takeIf { it.isNotBlank() }

val releaseStoreFilePath = signingValue("storeFile", "ANDROID_KEYSTORE_PATH")
val releaseStorePassword = signingValue("storePassword", "ANDROID_KEYSTORE_PASSWORD")
val releaseKeyAlias = signingValue("keyAlias", "ANDROID_KEY_ALIAS")
val releaseKeyPassword = signingValue("keyPassword", "ANDROID_KEY_PASSWORD")
val releaseStoreFile = releaseStoreFilePath?.let(rootProject::file)
val hasReleaseSigning = releaseStoreFile?.isFile == true &&
    releaseStorePassword != null &&
    releaseKeyAlias != null &&
    releaseKeyPassword != null

android {
    namespace = "az.setservice.worker_app"
    compileSdk = 36
    ndkVersion = "27.0.12077973"

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_11.toString()
    }

    defaultConfig {
        applicationId = "az.setservice.worker_app"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = 23
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
        manifestPlaceholders["usesCleartextTraffic"] = "false"
    }

    signingConfigs {
        if (hasReleaseSigning) {
            create("release") {
                storeFile = releaseStoreFile
                storePassword = releaseStorePassword
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPassword
            }
        }
    }

    buildTypes {
        debug {
            manifestPlaceholders["usesCleartextTraffic"] = "true"
        }
        release {
            if (hasReleaseSigning) {
                signingConfig = signingConfigs.getByName("release")
            }
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
            manifestPlaceholders["usesCleartextTraffic"] = "false"
        }
    }
}

flutter {
    source = "../.."
}

dependencies {
    implementation("androidx.core:core-splashscreen:1.0.1")
}

gradle.taskGraph.whenReady {
    val releasePackagingRequested = allTasks.any { task ->
        val name = task.name.lowercase()
        name.contains("release") &&
            (name.startsWith("bundle") ||
                name.startsWith("assemble") ||
                name.startsWith("package"))
    }
    if (releasePackagingRequested && !hasReleaseSigning) {
        throw GradleException(
            "Release signing is not configured. Provide android/key.properties " +
                "or ANDROID_KEYSTORE_PATH, ANDROID_KEYSTORE_PASSWORD, " +
                "ANDROID_KEY_ALIAS, and ANDROID_KEY_PASSWORD.",
        )
    }
}
