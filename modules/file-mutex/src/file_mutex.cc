// file_lock.cpp
#include <node_api.h>
#include <fcntl.h>
#include <string.h>
#include <time.h>
#include <stdio.h>

#ifdef _WIN32
  #include <windows.h>
  #include <io.h>
  
  static constexpr double MILLISECONDS_FROM_WIN_TO_UNIX_EPOCH = 11644473600000.0;
#else
  #include <unistd.h>
  #include <sys/file.h>
  #include <sys/time.h>
  #include <sys/stat.h>
#endif

napi_value OpenFile(napi_env env, napi_callback_info info) {
    size_t argc = 1;
    napi_value args[1];
    napi_status status = napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
    if (status != napi_ok || argc < 1) {
        napi_throw_error(env, nullptr, "Expected filename");
        return nullptr;
    }

    size_t path_len;
#ifdef _WIN32
    char16_t path[4096];
    status = napi_get_value_string_utf16(env, args[0], path, sizeof(path), &path_len);
#else
    char path[4096];
    status = napi_get_value_string_utf8(env, args[0], path, sizeof(path), &path_len);
#endif
    if (status != napi_ok) {
        napi_throw_error(env, nullptr, "Invalid filename");
        return nullptr;
    }
#ifdef _WIN32
    path[path_len] = L'\0';

    HANDLE handle = CreateFileW(
        reinterpret_cast<LPCWSTR>(path),
        GENERIC_READ | GENERIC_WRITE,
        FILE_SHARE_READ | FILE_SHARE_WRITE,
        NULL,
        OPEN_ALWAYS,
        0,
        NULL
    );
    if (handle == INVALID_HANDLE_VALUE) {
        char err[256];
        snprintf(err, sizeof(err), "CreateFile failed: %lu", GetLastError());
        napi_throw_error(env, nullptr, err);
        return nullptr;
    }
#else
    path[path_len] = '\0';

    int handle = open(path, O_RDWR|O_CREAT, S_IRUSR|S_IWUSR|S_IRGRP|S_IROTH);
    if (handle == -1) {
        napi_throw_error(env, nullptr, "open failed");
        return nullptr;
    }
#endif

    napi_value result;
#ifdef _WIN32
    status = napi_create_bigint_uint64(env, reinterpret_cast<uint64_t>(handle), &result);
#else
    status = napi_create_bigint_uint64(env, static_cast<uint64_t>(handle), &result);
#endif
    if (status != napi_ok) {
        napi_throw_error(env, nullptr, "Could not create BigInt handle");
        return nullptr;
    }

    return result;
}

napi_value LockFile(napi_env env, napi_callback_info info) {
    size_t argc = 2;
    napi_value args[2];
    napi_status status = napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
    if (status != napi_ok || argc < 2) {
        napi_throw_error(env, nullptr, "Expected file handle");
        return nullptr;
    }

    uint64_t handle_arg;
    bool lossless;
    status = napi_get_value_bigint_uint64(env, args[0], &handle_arg, &lossless);
    if (status != napi_ok || !lossless) {
        napi_throw_error(env, nullptr, "Invalid handle (BigInt expected)");
        return nullptr;
    }

    bool exclusive;
    status = napi_get_value_bool(env, args[1], &exclusive);
    if (status != napi_ok) {
        napi_throw_error(env, nullptr, "Invalid exclusive flag");
        return nullptr;
    }

#ifdef _WIN32
    OVERLAPPED ov = {};
    HANDLE handle = reinterpret_cast<HANDLE>(handle_arg);
    BOOL result = LockFileEx(handle, exclusive ? LOCKFILE_EXCLUSIVE_LOCK : 0, 0, MAXDWORD, MAXDWORD, &ov);
    if (!result) {
        char err[256];
        snprintf(err, sizeof(err), "LockFileEx failed: %lu", GetLastError());
        napi_throw_error(env, nullptr, err);
        return nullptr;
    }
#else
    int handle = static_cast<int>(handle_arg);
    if (flock(handle, exclusive ? LOCK_EX : LOCK_SH) != 0) {
        napi_throw_error(env, nullptr, "flock failed");
        return nullptr;
    }
#endif

    return nullptr;
}

napi_value UnlockFile(napi_env env, napi_callback_info info) {
    size_t argc = 1;
    napi_value args[1];
    napi_status status = napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
    if (status != napi_ok || argc < 1) {
        napi_throw_error(env, nullptr, "Expected file handle");
        return nullptr;
    }

    uint64_t handle_arg;
    bool lossless;
    status = napi_get_value_bigint_uint64(env, args[0], &handle_arg, &lossless);
    if (status != napi_ok || !lossless) {
        napi_throw_error(env, nullptr, "Invalid handle");
        return nullptr;
    }

#ifdef _WIN32
    OVERLAPPED ov = {};
    HANDLE handle = reinterpret_cast<HANDLE>(handle_arg);
    BOOL result = UnlockFileEx(handle, 0, MAXDWORD, MAXDWORD, &ov);
    if (!result) {
        char err[256];
        snprintf(err, sizeof(err), "UnlockFileEx failed: %lu", GetLastError());
        napi_throw_error(env, nullptr, err);
        return nullptr;
    }
#else
    int handle = static_cast<int>(handle_arg);
    if (flock(handle, LOCK_UN) != 0) {
        napi_throw_error(env, nullptr, "flock unlock failed");
        return nullptr;
    }
#endif

    return nullptr;
}

napi_value GetFileTime(napi_env env, napi_callback_info info) {
    size_t argc = 1;
    napi_value args[1];
    napi_status status = napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
    if (status != napi_ok || argc < 1) {
        napi_throw_error(env, nullptr, "Expected file handle");
        return nullptr;
    }

    uint64_t handle_arg;
    bool lossless;
    status = napi_get_value_bigint_uint64(env, args[0], &handle_arg, &lossless);
    if (status != napi_ok || !lossless) {
        napi_throw_error(env, nullptr, "Invalid handle (BigInt expected)");
        return nullptr;
    }

    double time_ms = 0;

#ifdef _WIN32
    FILETIME ftWrite;
    HANDLE handle = reinterpret_cast<HANDLE>(handle_arg);
    if (!GetFileTime(handle, nullptr, nullptr, &ftWrite)) {
        char err[256];
        snprintf(err, sizeof(err), "GetFileTime failed: %lu", GetLastError());
        napi_throw_error(env, nullptr, err);
        return nullptr;
    }

    time_ms = ((static_cast<uint64_t>(ftWrite.dwHighDateTime) << 32) | ftWrite.dwLowDateTime) / 10000 - MILLISECONDS_FROM_WIN_TO_UNIX_EPOCH;
#else
    struct stat st;
    int handle = static_cast<int>(handle_arg);
    if (fstat(handle, &st) != 0) {
        napi_throw_error(env, nullptr, "fstat failed");
        return nullptr;
    }
    #ifdef __APPLE__
        time_ms = static_cast<double>(st.st_mtimespec.tv_sec) * 1000.0 + static_cast<double>(st.st_mtimespec.tv_nsec) / 1000000.0;
    #else
        time_ms = static_cast<double>(st.st_mtim.tv_sec) * 1000.0 + static_cast<double>(st.st_mtim.tv_nsec) / 1000000.0;
    #endif
#endif

    napi_value result;
    status = napi_create_double(env, time_ms, &result);
    if (status != napi_ok) {
        napi_throw_error(env, nullptr, "Could not create BigInt result");
        return nullptr;
    }

    return result;
}

napi_value SetFileTime(napi_env env, napi_callback_info info) {
    size_t argc = 2;
    napi_value args[2];
    napi_status status = napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
    if (status != napi_ok || argc < 2) {
        napi_throw_error(env, nullptr, "Expected handle and timestamp");
        return nullptr;
    }

    uint64_t handle_arg;
    bool lossless;
    status = napi_get_value_bigint_uint64(env, args[0], &handle_arg, &lossless);
    if (status != napi_ok || !lossless) {
        napi_throw_error(env, nullptr, "Invalid handle");
        return nullptr;
    }

    double time_ms;
    status = napi_get_value_double(env, args[1], &time_ms);
    if (status != napi_ok) {
        napi_throw_error(env, nullptr, "Invalid timestamp");
        return nullptr;
    }

#ifdef _WIN32
    int64_t win_time = static_cast<int64_t>((time_ms + MILLISECONDS_FROM_WIN_TO_UNIX_EPOCH) * 10000);
    FILETIME mtime;
    mtime.dwLowDateTime = static_cast<DWORD>(win_time & 0xFFFFFFFF);
    mtime.dwHighDateTime = static_cast<DWORD>(win_time >> 32);

    HANDLE handle = reinterpret_cast<HANDLE>(handle_arg);
    if (!SetFileTime(handle, NULL, NULL, &mtime)) {
        char err[256];
        snprintf(err, sizeof(err), "SetFileTime failed: %lu", GetLastError());
        napi_throw_error(env, nullptr, err);
        return nullptr;
    }
#else
    struct timespec times[2];
    times[0].tv_sec = UTIME_OMIT;
    times[0].tv_nsec = UTIME_OMIT;
    times[1].tv_sec = static_cast<int32_t>(time_ms / 1000.0);
    times[1].tv_nsec = static_cast<int32_t>((time_ms - times[1].tv_sec * 1000.0) * 1000000.0);

    int handle = static_cast<int>(handle_arg);
    if (futimens(handle, times) != 0) {
        napi_throw_error(env, nullptr, "futimens failed");
        return nullptr;
    }
#endif

    return nullptr;
}

napi_value CloseFile(napi_env env, napi_callback_info info) {
    size_t argc = 1;
    napi_value args[1];
    napi_status status = napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
    if (status != napi_ok || argc < 1) {
        napi_throw_error(env, nullptr, "Expected file handle");
        return nullptr;
    }

    uint64_t handle_arg;
    bool lossless;
    status = napi_get_value_bigint_uint64(env, args[0], &handle_arg, &lossless);
    if (status != napi_ok || !lossless) {
        napi_throw_error(env, nullptr, "Invalid handle");
        return nullptr;
    }

#ifdef _WIN32
    HANDLE handle = reinterpret_cast<HANDLE>(handle_arg);
    if (!CloseHandle(handle)) {
        char err[256];
        snprintf(err, sizeof(err), "CloseHandle failed: %lu", GetLastError());
        napi_throw_error(env, nullptr, err);
        return nullptr;
    }
#else
    int handle = static_cast<int>(handle_arg);
    if (close(handle) != 0) {
        napi_throw_error(env, nullptr, "close failed");
        return nullptr;
    }
#endif

    return nullptr;
}

napi_value Init(napi_env env, napi_value exports) {
    napi_status status;

    #define DECLARE_NAPI_METHOD(name, func)                         \
      do {                                                          \
        napi_value fn;                                              \
        status = napi_create_function(env, name, NAPI_AUTO_LENGTH,  \
                                      func, NULL, &fn);             \
        if (status != napi_ok) return nullptr;                      \
        status = napi_set_named_property(env, exports, name, fn);   \
        if (status != napi_ok) return nullptr;                      \
      } while(0)

    DECLARE_NAPI_METHOD("openFile", OpenFile);
    DECLARE_NAPI_METHOD("lockFile", LockFile);
    DECLARE_NAPI_METHOD("unlockFile", UnlockFile);
    DECLARE_NAPI_METHOD("getFileTime", GetFileTime);
    DECLARE_NAPI_METHOD("setFileTime", SetFileTime);
    DECLARE_NAPI_METHOD("closeFile", CloseFile);

    return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
