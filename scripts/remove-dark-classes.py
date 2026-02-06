#!/usr/bin/env python3
"""Remove all dark: Tailwind classes from Catalyst components."""

import re
import glob
from pathlib import Path

def remove_dark_classes(content: str) -> str:
    """Remove all dark: prefixed Tailwind classes."""
    # Pattern 1: Remove lines that only contain dark: classes
    lines = content.split('\n')
    filtered_lines = []

    for line in lines:
        # Check if line only contains dark: class(es) and is within an array
        stripped = line.strip()
        if stripped.startswith("'dark:") or stripped.startswith('"dark:'):
            # Skip this line entirely
            continue
        filtered_lines.append(line)

    content = '\n'.join(filtered_lines)

    # Pattern 2: Remove dark: classes that are part of a longer string
    # Handles: ' text-white dark:text-black' -> ' text-white'
    content = re.sub(r'\s+dark:[^\s\'"]*', '', content)

    # Clean up extra spaces and trailing spaces before quotes/commas
    content = re.sub(r'  +', ' ', content)
    content = re.sub(r" '", "'", content)
    content = re.sub(r' "', '"', content)
    content = re.sub(r' \]', ']', content)
    content = re.sub(r' ,', ',', content)

    return content

def main():
    catalyst_dir = Path('apps/storefront/src/components/catalyst')
    files = list(catalyst_dir.glob('*.tsx'))

    print(f"Processing {len(files)} files...")

    for file_path in files:
        with open(file_path, 'r') as f:
            content = f.read()

        cleaned_content = remove_dark_classes(content)

        if content != cleaned_content:
            with open(file_path, 'w') as f:
                f.write(cleaned_content)
            print(f"✓ {file_path.name}")

    # Verify
    remaining = 0
    for file_path in files:
        with open(file_path, 'r') as f:
            content = f.read()
        matches = re.findall(r'\bdark:', content)
        if matches:
            count = len(matches)
            remaining += count
            print(f"  {file_path.name}: {count} remaining")

    if remaining == 0:
        print("\n✓ All dark: classes removed successfully!")
    else:
        print(f"\n⚠ Warning: {remaining} dark: classes still remain")

if __name__ == '__main__':
    main()
