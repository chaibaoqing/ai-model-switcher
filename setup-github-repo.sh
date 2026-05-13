#!/bin/bash

# GitHub Repository Setup Script
# This script will help you set up the ai-model-switcher repository and push it to GitHub

echo "🚀 Setting up GitHub repository for ai-model-switcher"
echo "=================================================="

# Check if git is installed
if ! command -v git &> /dev/null; then
    echo "❌ Git is not installed. Please install Git first."
    exit 1
fi

echo "✅ Git is installed"

# Determine project root (this script's parent directory)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Check if gh CLI is available
if command -v gh &> /dev/null; then
    echo "✅ GitHub CLI (gh) is available"

    cd "$SCRIPT_DIR"

    # Initialize git repository
    echo "📁 Initializing git repository..."
    git init

    # Add all files
    echo "📦 Adding all files to git..."
    git add .

    # Commit with initial message
    echo "💾 Creating initial commit..."
    git commit -m "Initial commit: ai-model-switcher project"

    # Create GitHub repository
    echo "🏗️  Creating GitHub repository..."
    if gh repo create chaibaoqing/ai-model-switcher --public --source=. --push; then
        echo "✅ Repository created and code pushed successfully!"
        echo "🔗 Repository URL: https://github.com/chaibaoqing/ai-model-switcher"
    else
        echo "❌ Failed to create repository. You may need to authenticate with GitHub first."
        echo "💡 Try: gh auth login"
    fi

else
    echo "⚠️  GitHub CLI (gh) is not available. Using manual method..."

    cd "$SCRIPT_DIR"

    # Initialize git repository
    echo "📁 Initializing git repository..."
    git init

    # Add all files
    echo "📦 Adding all files to git..."
    git add .

    # Commit with initial message
    echo "💾 Creating initial commit..."
    git commit -m "Initial commit: ai-model-switcher project"

    echo "✅ Git repository initialized and committed"
    echo ""
    echo "🔧 Next steps - you need to create the repository manually:"
    echo "1. Go to https://github.com/new"
    echo "2. Repository name: ai-model-switcher"
    echo "3. Make it Public"
    echo "4. Don't initialize with README (we already have one)"
    echo "5. Click 'Create repository'"
    echo "6. Then run these commands:"
    echo "   git remote add origin https://github.com/chaibaoqing/ai-model-switcher.git"
    echo "   git branch -M main"
    echo "   git push -u origin main"
    echo ""
    echo "🔗 Repository URL will be: https://github.com/chaibaoqing/ai-model-switcher"
fi
