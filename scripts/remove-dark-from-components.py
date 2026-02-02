#!/usr/bin/env python3
"""Remove all dark: Tailwind classes from admin React components."""

import re
from pathlib import Path

def remove_dark_classes(content: str) -> str:
    """Remove all dark: prefixed Tailwind classes."""
    # Remove dark: classes
    content = re.sub(r'\s+dark:[^\s\'"]*', '', content)

    # Clean up extra spaces
    content = re.sub(r'  +', ' ', content)
    content = re.sub(r" '", "'", content)
    content = re.sub(r' "', '"', content)
    content = re.sub(r' ,', ',', content)

    return content

def main():
    admin_dir = Path('apps/storefront/src/components/admin')
    files = list(admin_dir.glob('*.tsx'))

    print(f"Processing {len(files)} admin component files...")

    modified_count = 0
    for file_path in files:
        with open(file_path, 'r') as f:
            content = f.read()

        cleaned_content = remove_dark_classes(content)

        if content != cleaned_content:
            with open(file_path, 'w') as f:
                f.write(cleaned_content)
            modified_count += 1
            print(f"✓ {file_path.name}")

    print(f"\n✓ Modified {modified_count} files")

    # Verify
    remaining = 0
    for file_path in files:
        with open(file_path, 'r') as f:
            content = f.read()
        count = len(re.findall(r'\bdark:', content))
        if count > 0:
            remaining += count
            print(f"  ⚠ {file_path.name}: {count} remaining")

    if remaining == 0:
        print("\n✓ All dark: classes removed from admin components!")
    else:
        print(f"\n⚠ Warning: {remaining} dark: classes still remain")

if __name__ == '__main__':
    main()
