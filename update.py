#!/usr/bin/python3

import json
import subprocess
import sys


def run_command(command):
    """Run shell command."""
    result = subprocess.run(command, shell=True, text=True, capture_output=True, check=False)
    if result.returncode != 0:
        print(f"Error: {result.stderr}")
        sys.exit(1)
    return result.stdout

def update_version(version_type):
    """Update version in package.json based on version type."""
    with open("package.json", encoding='utf-8') as file:
        data = json.load(file)

    # Split current version into major, minor, patch
    version_parts = data["version"].split('.')
    major, minor, patch = map(int, version_parts)

    # Update version based on type
    if version_type == "major":
        major += 1
        minor = 0
        patch = 0
    elif version_type == "minor":
        minor += 1
        patch = 0
    else:  # default to patch
        patch += 1

    # Construct new version string
    new_version = f"{major}.{minor}.{patch}"
    data["version"] = new_version

    # Write updated version back to package.json
    with open("package.json", "w", encoding='utf-8') as file:
        json.dump(data, file, indent=2)

    return new_version

def main():
    version_type = sys.argv[1] if len(sys.argv) > 1 else "patch"

    # Update the version in package.json
    new_version = update_version(version_type)

    # Run npm install to update packages and package-lock.json
    print("Running npm install...")
    run_command("npm install")

    # Git commit and tag with new version
    print("Committing changes and tagging...")
    run_command("git add .")
    run_command(f"git commit -m 'Update to version {new_version}'")
    run_command(f"git tag -a v{new_version} -m 'Version {new_version}'")

    # Push changes and tags
    # print("Pushing changes and tags to remote repository...")
    # run_command("git push")
    # run_command("git push --tags")

    print(f"Update to version {new_version} complete. Run 'git push --tags' to push changes to remote repository")

if __name__ == "__main__":
    main()
