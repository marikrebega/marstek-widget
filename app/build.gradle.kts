plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

fun Project.gitOutput(vararg args: String): String? {
    return try {
        val execOutput = providers.exec {
            commandLine("git", *args)
            isIgnoreExitValue = true
        }
        if (execOutput.result.get().exitValue == 0) {
            execOutput.standardOutput.asText.get().trim().takeIf { it.isNotEmpty() }
        } else {
            null
        }
    } catch (_: Exception) {
        null
    }
}

fun Project.resolveVersionCode(): Int {
    val propCode = (findProperty("versionCode") as? String)?.toIntOrNull()
    if (propCode != null && propCode > 0) return propCode

    val ciRunNumber = System.getenv("GITHUB_RUN_NUMBER")?.toIntOrNull()
    if (ciRunNumber != null && ciRunNumber > 0) return ciRunNumber

    val commitCount = gitOutput("rev-list", "--count", "HEAD")?.toIntOrNull()
    if (commitCount != null && commitCount > 0) return commitCount

    return 1
}

fun Project.resolveVersionName(): String {
    val propName = (findProperty("versionName") as? String)?.trim()
    if (!propName.isNullOrEmpty()) return propName

    val exactTag = gitOutput("describe", "--tags", "--exact-match")
    if (exactTag != null) {
        return exactTag.removePrefix("v")
    }

    val describe = gitOutput("describe", "--tags", "--long")
    if (describe != null) {
        return describe.removePrefix("v")
    }

    val commitCount = gitOutput("rev-list", "--count", "HEAD")
    val shortSha = gitOutput("rev-parse", "--short", "HEAD")
    if (commitCount != null && shortSha != null) {
        return "1.0.$commitCount-$shortSha"
    }

    return "1.0"
}

android {
    namespace = "com.marstek.widget"
    compileSdk = 34

    val vCode = project.resolveVersionCode()
    val vName = project.resolveVersionName()

    val localDebugKeystore = file("debug.keystore")
    val releaseKeystorePath = System.getenv("ANDROID_KEYSTORE_PATH")?.takeIf { it.isNotBlank() }
    val releaseStorePass = System.getenv("ANDROID_KEYSTORE_PASSWORD")
    val releaseKeyAlias = System.getenv("ANDROID_KEY_ALIAS")
    val releaseKeyPass = System.getenv("ANDROID_KEY_PASSWORD")

    signingConfigs {
        if (localDebugKeystore.exists()) {
            getByName("debug") {
                storeFile = localDebugKeystore
                storePassword = "android"
                keyAlias = "androiddebugkey"
                keyPassword = "android"
            }
        }
        if (
            releaseKeystorePath != null &&
            file(releaseKeystorePath).exists() &&
            !releaseStorePass.isNullOrEmpty() &&
            !releaseKeyAlias.isNullOrEmpty() &&
            !releaseKeyPass.isNullOrEmpty()
        ) {
            create("release") {
                storeFile = file(releaseKeystorePath)
                storePassword = releaseStorePass
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPass
            }
        }
    }

    defaultConfig {
        applicationId = "com.marstek.widget"
        minSdk = 26
        targetSdk = 34
        versionCode = vCode
        versionName = vName
    }

    buildTypes {
        debug {
            signingConfig = signingConfigs.getByName("debug")
        }
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.6.1")
}
