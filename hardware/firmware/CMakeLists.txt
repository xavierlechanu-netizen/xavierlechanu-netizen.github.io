# ============================================================================
# Projet Firmware "Boîte Noire" — mon 50cc et moi
# Cible : ESP32-C3-MINI-1 (RISC-V, BLE 5.0, AES-256 HW)
# Framework : ESP-IDF v5.x
# ============================================================================

cmake_minimum_required(VERSION 3.16)

# Inclure les outils ESP-IDF
include($ENV{IDF_PATH}/tools/cmake/project.cmake)

project(blackbox_firmware)
