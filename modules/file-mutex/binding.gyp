{
  "targets": [
    {
      "target_name": "file-mutex",
      "sources": ["src/file_mutex.cc"],
      "include_dirs": [
        "<!(node -p \"require('node-addon-api').include\")"
      ],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],
      "cflags!": ["-fno-exceptions"],
      "cflags_cc!": ["-fno-exceptions"],
      "conditions": [
        ["OS=='win'", {
          "defines": ["_HAS_EXCEPTIONS=1"],
          "msvs_settings": {
            "VCCLCompilerTool": {"ExceptionHandling": 1}
          }
        }]
      ],
      "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"]
    }
  ]
}