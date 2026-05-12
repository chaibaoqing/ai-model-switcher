#!/bin/bash

# GitHub Repository Setup Script
# This script will help you set up the codex-model-switcher repository and push it to GitHub

echo "🚀 Setting up GitHub repository for codex-model-switcher"
echo "=================================================="

# Check if git is installed
if ! command -v git &> /dev/null; then
    echo "❌ Git is not installed. Please install Git first."
    exit 1
fi

echo "✅ Git is installed"

# Check if gh CLI is available
if command -v gh &> /dev/null; then
    echo "✅ GitHub CLI (gh) is available"

    # Change to project directory
    cd /Users/c/Desktop/ccswitch-deepseek/codex-model-switcher

    # Initialize git repository
    echo "📁 Initializing git repository..."
    git init

    # Add all files
    echo "📦 Adding all files to git..."
    git add .

    # Commit with initial message
    echo "💾 Creating initial commit..."
    git commit -m "Initial commit: codex-model-switcher project"

    # Create GitHub repository
    echo "🏗️  Creating GitHub repository..."
    if gh repo create chaibaoqing/codex-model-switcher --public --source=. --push; then
        echo "✅ Repository created and code pushed successfully!"
        echo "🔗 Repository URL: https://github.com/chaibaoqing/codex-model-switcher"
    else
        echo "❌ Failed to create repository. You may need to authenticate with GitHub first."
        echo "💡 Try: gh auth login"
    fi

else
    echo "⚠️  GitHub CLI (gh) is not available. Using manual method..."

    # Change to project directory
    cd /Users/c/Desktop/ccswitch-deepseek/codex-model-switcher

    # Initialize git repository
    echo "📁 Initializing git repository..."
    git init

    # Add all files
    echo "📦 Adding all files to git..."
    git add .

    # Commit with initial message
    echo "💾 Creating initial commit..."
    git commit -m "Initial commit: codex-model-switcher project"

    echo "✅ Git repository initialized and committed"
    echo ""
    echo "🔧 Next steps - you need to create the repository manually:"
    echo "1. Go to https://github.com/new"
    echo "2. Repository name: codex-model-switcher"
    echo "3. Make it Public"
    echo "4. Don't initialize with README (we already have one)"
    echo "5. Click 'Create repository'"
    echo "6. Then run these commands:"
    echo "   git remote add origin https://github.com/chaibaoqing/codex-model-switcher.git"
    echo "   git branch -M main"
    echo "   git push -u origin main"
    echo ""
    echo "🔗 Repository URL will be: https://github.com/chaibaoqing/codex-model-switcher"
fi