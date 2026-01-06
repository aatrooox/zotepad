# Styling Guide

Milkdown is a headless editor, meaning it gives you complete control over appearance.

## Styling Crepe Theme

To use the Crepe theme:

```typescript
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/crepe.css"; // or other variants
```

### CSS Variables

Crepe uses CSS variables for consistent styling. You can override these in your CSS.

**Colors (Example)**
```css
.milkdown {
  /* Background Colors */
  --crepe-color-background: #fffdfb;
  --crepe-color-surface: #fff8f4;
  
  /* Text Colors */
  --crepe-color-on-background: #1f1b16;
  
  /* Accent Colors */
  --crepe-color-primary: #805610;
}
```

**Typography**
```css
.milkdown {
  --crepe-font-title: Georgia, serif;
  --crepe-font-default: "Open Sans", sans-serif;
  --crepe-font-code: Fira Code, monospace;
}
```

**Shadows**
```css
.milkdown {
  --crepe-shadow-1: 0px 1px 3px 1px rgba(0, 0, 0, 0.15);
}
```

### Customizing Crepe Theme

```css
/* custom-overrides.css */
.crepe .milkdown {
  --crepe-color-primary: #your-primary-color;
  --crepe-color-background: #your-background-color;
}
```

## Basic Milkdown Styling

If not using Crepe, you can style core elements:

```css
.milkdown .editor {
  max-width: 800px;
  margin: 0 auto;
}

.milkdown .editor .paragraph {
  margin: 1rem 0;
}

.milkdown .editor .heading {
  font-weight: 600;
}
```

## Custom Attributes (Tailwind Example)

You can inject classes into nodes:

```typescript
import { Editor, editorViewOptionsCtx } from "@milkdown/kit/core";
import { headingAttr, paragraphAttr } from "@milkdown/kit/preset/commonmark";

Editor.make()
  .config((ctx) => {
    // Container attributes
    ctx.update(editorViewOptionsCtx, (prev) => ({
      ...prev,
      attributes: {
        class: "milkdown-editor mx-auto",
        spellcheck: "false",
      },
    }));

    // Node attributes
    ctx.set(headingAttr.key, (node) => {
      const level = node.attrs.level;
      return {
        class: `heading-${level} font-bold`,
      };
    });
  });
```
