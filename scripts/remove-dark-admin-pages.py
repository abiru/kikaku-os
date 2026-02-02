#!/usr/bin/env python3
"""
Remove all dark: Tailwind CSS classes from admin page files.
"""

import re
import glob
from pathlib import Path

def remove_dark_classes(content: str) -> str:
    """Remove dark: classes from content"""
    # Remove lines that only contain dark: classes
    lines = content.split('\n')
    filtered_lines = []
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("'dark:") or stripped.startswith('"dark:'):
            continue
        filtered_lines.append(line)

    content = '\n'.join(filtered_lines)

    # Remove dark: classes from className strings and class attributes
    content = re.sub(r'\s+dark:[^\s\'"]*', '', content)

    return content

def process_file(filepath: Path):
    """Process a single file"""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            original = f.read()

        modified = remove_dark_classes(original)

        if modified != original:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(modified)
            print(f'✓ {filepath}')
            return 1
        return 0
    except Exception as e:
        print(f'✗ {filepath}: {e}')
        return 0

def main():
    admin_pages = Path('apps/storefront/src/pages/admin')

    # Process .astro files
    astro_files = list(admin_pages.glob('**/*.astro'))
    count = 0

    print(f'Processing {len(astro_files)} admin page files...\n')
    for filepath in astro_files:
        count += process_file(filepath)

    print(f'\n✓ Processed {count} files')

if __name__ == '__main__':
    main()
