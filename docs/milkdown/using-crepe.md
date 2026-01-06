# Using Crepe Editor

Crepe is a powerful, feature-rich Markdown editor built on top of Milkdown. It provides a complete editing experience with a beautiful UI and extensive customization options.

## Quick Start

### Installation

```bash
# Using npm
npm install @milkdown/crepe

# Using yarn
yarn add @milkdown/crepe

# Using pnpm
pnpm add @milkdown/crepe
```

### Basic Usage

```typescript
import { Crepe } from "@milkdown/crepe";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";

// Create editor instance
const crepe = new Crepe({
  root: document.getElementById("app"),
  defaultValue: "# Hello, Crepe!\n\nStart writing your markdown...",
});

// Initialize the editor
await crepe.create();

// Clean up when done
crepe.destroy();
```

## Themes

Crepe comes with several beautiful themes out of the box:

### Light Themes
- `frame`: Modern frame-based design
- `classic`: Traditional editor look
- `nord`: Clean, minimal Nord color scheme

### Dark Themes
- `frame-dark`: Dark version of frame theme
- `classic-dark`: Dark version of classic theme
- `nord-dark`: Dark version of nord theme

To use a theme:

```typescript
// Import base styles first
import "@milkdown/crepe/theme/common/style.css";
// Then import your chosen theme
import "@milkdown/crepe/theme/frame.css";
```

## Features

Crepe includes a comprehensive set of features that can be enabled or disabled as needed.

### Feature Configuration

```typescript
const crepe = new Crepe({
  features: {
    // Disable specific features
    [Crepe.Feature.CodeMirror]: false,
    [Crepe.Feature.Table]: false,
  },
  featureConfigs: {
    // Configure feature behavior
    [Crepe.Feature.LinkTooltip]: {
      inputPlaceholder: "Enter URL...",
    },
    // Customize icons
    [Crepe.Feature.Bold]: {
       boldIcon: '<b>B</b>' // HTML or string
    },
    // Image Upload Configuration
    [Crepe.Feature.ImageBlock]: {
      // onUpload must return a Promise that resolves to the image URL
      onUpload: (file) => {
        return new Promise((resolve) => {
          // Mock upload delay
          setTimeout(() => {
             resolve("https://example.com/image.png");
          }, 1000);
        });
      }
    }
  },
});
```

### Available Features

1.  **Code Editor (`CodeMirror`)**: Syntax highlighting and editing for code blocks.
2.  **List Management (`ListItem`)**: Bullet, ordered, and todo lists.
3.  **Link Management (`LinkTooltip`)**: Enhanced link editing with preview.
4.  **Image Handling (`ImageBlock`)**: Image upload and management.
5.  **Block Editing (`BlockEdit`)**: Drag-and-drop block management and slash commands.
6.  **Table Support (`Table`)**: Full-featured table editing.
7.  **Toolbar (`Toolbar`)**: Formatting toolbar for selected text.
8.  **Cursor (`Cursor`)**: Enhanced cursor experience.
9.  **Placeholder (`Placeholder`)**: Document or block level placeholders.
10. **Latex (`Latex`)**: Mathematical formula support using KaTeX.

## Editor Instance Methods

```typescript
const editor = crepe.editor; // Access Milkdown editor instance
await crepe.create(); // Initialize
crepe.destroy(); // Cleanup
crepe.setReadonly(true); // Toggle readonly
const markdown = crepe.getMarkdown(); // Get content

// Event listeners
crepe.on((listener) => {
  listener.markdownUpdated((markdown) => {
    console.log("Markdown updated:", markdown);
  });
});
```
