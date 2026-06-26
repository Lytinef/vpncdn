import java.io.FileInputStream
import java.util.Properties

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// Релизный keystore: android/key.properties (НЕ в git). Если файла нет —
// release подписывается debug-ключом (для `flutter run --release` на dev-машине).
val keystoreProperties = Properties()
val keystorePropertiesFile = rootProject.file("key.properties")
val hasReleaseKeystore = keystorePropertiesFile.exists()
if (hasReleaseKeystore) {
    keystoreProperties.load(FileInputStream(keystorePropertiesFile))
}

android {
    namespace = "com.vpncdn.client"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        applicationId = "com.unway.app"
        minSdk = 24
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        create("release") {
            if (hasReleaseKeystore) {
                storeFile = file(keystoreProperties["storeFile"] as String)
                storePassword = keystoreProperties["storePassword"] as String
                keyAlias = keystoreProperties["keyAlias"] as String
                keyPassword = keystoreProperties["keyPassword"] as String
            }
        }
    }

    buildTypes {
        release {
            // Релизный ключ из key.properties; без него — debug (для dev).
            signingConfig = if (hasReleaseKeystore)
                signingConfigs.getByName("release")
            else
                signingConfigs.getByName("debug")
            // R8 вырезает методы go.Seq (вызываются только из нативного кода libgojni
            // через JNI) → краш "failed to find method Seq.getRef". Отключаем shrink;
            // keep-правила в proguard-rules.pro оставлены на случай включения минификации.
            isMinifyEnabled = false
            isShrinkResources = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    // Два варианта VPN-ядра:
    //  stub — без нативных библиотек (быстрая установка, туннель не работает);
    //  full — с libxray.aar и tun2socks в app/libs/ (рабочий VPN, см. xray/MOBILE.md).
    flavorDimensions += "vpncore"
    productFlavors {
        create("stub") { dimension = "vpncore" }
        create("full") { dimension = "vpncore" }
    }
    sourceSets {
        getByName("stub") { java.srcDir("src/stub/kotlin") }
        getByName("full") { java.srcDir("src/full/kotlin") }
    }

    // Распаковывать нативные .so на диск (nativeLibraryDir) — для загрузки
    // libwg-go.so (AmneziaWG) и сопутствующих ядер.
    packaging {
        jniLibs {
            useLegacyPackaging = true
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
    // Классы Xray-ядра (app/libs/libxray.jar) — компиляция и упаковка в dex.
    // Используются только во flavor full; нативные .so — в src/full/jniLibs/.
    implementation(files("libs/libxray.jar"))
}
