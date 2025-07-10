#!/usr/bin/env sh

set -e

echo "Downloading Flutter..."
if [ ! -d "../flutter" ]; then
  git clone https://github.com/flutter/flutter.git -b stable ../flutter
fi

export PATH="$PATH:`pwd`/../flutter/bin"

echo "Checking Flutter version..."
flutter --version

echo "Getting dependencies..."
flutter pub get

echo "Generating .env file..."
echo "STRIPE_TEST_PUBLISH_KEY=$STRIPE_TEST_PUBLISH_KEY" > .env
echo "STRIPE_TEST_SECRET_KEY=$STRIPE_TEST_SECRET_KEY" >> .env
# Bundled for mobile/desktop; on web, extraction uses /api/openai-chat proxy (server reads this from Vercel env).
echo "OPENAI_API_KEY=$OPENAI_API_KEY" >> .env

echo "Building Flutter Web..."
flutter build web --release

echo "Build complete!"
