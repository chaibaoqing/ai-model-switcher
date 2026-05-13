#!/bin/bash
# AI Model Switcher 启动脚本
cd "$(dirname "$0")/.."
exec node src/server.js
