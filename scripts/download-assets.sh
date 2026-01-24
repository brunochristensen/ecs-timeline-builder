#!/bin/bash
# Download local assets for ECS Timeline Builder
# Run this script from a machine with internet access, then copy
# the fonts/ and lib/ directories to your closed environment

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FONTS_DIR="$SCRIPT_DIR/fonts"
LIB_DIR="$SCRIPT_DIR/lib"

echo "Creating directories..."
mkdir -p "$FONTS_DIR"
mkdir -p "$LIB_DIR"

echo ""
echo "Downloading D3.js v7..."
curl -L -o "$LIB_DIR/d3.v7.min.js" "https://d3js.org/d3.v7.min.js"

echo ""
echo "Downloading Inter font..."
# Inter from Google Fonts (woff2 format)
curl -L -o "$FONTS_DIR/Inter-Regular.woff2" \
    "https://github.com/rsms/inter/raw/master/docs/font-files/Inter-Regular.woff2"
curl -L -o "$FONTS_DIR/Inter-Medium.woff2" \
    "https://github.com/rsms/inter/raw/master/docs/font-files/Inter-Medium.woff2"
curl -L -o "$FONTS_DIR/Inter-SemiBold.woff2" \
    "https://github.com/rsms/inter/raw/master/docs/font-files/Inter-SemiBold.woff2"

echo ""
echo "Downloading JetBrains Mono font..."
# JetBrains Mono from official releases
curl -L -o /tmp/jetbrains-mono.zip \
    "https://github.com/JetBrains/JetBrainsMono/releases/download/v2.304/JetBrainsMono-2.304.zip"
unzip -j -o /tmp/jetbrains-mono.zip "fonts/webfonts/JetBrainsMono-Regular.woff2" -d "$FONTS_DIR/"
unzip -j -o /tmp/jetbrains-mono.zip "fonts/webfonts/JetBrainsMono-Medium.woff2" -d "$FONTS_DIR/"
rm /tmp/jetbrains-mono.zip

echo ""
echo "Done! Assets downloaded to:"
echo "  - $FONTS_DIR/"
echo "  - $LIB_DIR/"
echo ""
echo "Copy these directories to your closed environment."
