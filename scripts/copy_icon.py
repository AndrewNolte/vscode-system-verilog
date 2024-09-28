#! /usr/bin/env python3
import subprocess
import sys


def main():
    icon = sys.argv[1]
    subprocess.run(['cp', f'../vscode-icons/icons/dark/{icon}.svg', 'resources/dark/'])
    subprocess.run(['cp', f'../vscode-icons/icons/light/{icon}.svg', 'resources/light/'])

if __name__ == '__main__':
    main()