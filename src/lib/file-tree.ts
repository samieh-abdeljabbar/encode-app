import type { FileEntry } from "./types";

export interface TreeNode {
  name: string;
  path: string;         // full relative path from vault root
  isFolder: boolean;
  icon?: string;        // emoji icon for folders
  children: TreeNode[];
  file?: FileEntry;     // present for leaf files only
}

/**
 * Build a tree from a flat list of FileEntry objects.
 * basePath is the prefix to strip, e.g. "subjects/my-subject/chapters"
 * so files within subfolders get grouped into folder nodes.
 */
export function buildTree(files: FileEntry[], basePath: string, folderIcons?: Record<string, string>): TreeNode[] {
  const root: TreeNode[] = [];
  // Map of folder path → TreeNode for deduplication
  const folderMap = new Map<string, TreeNode>();

  for (const file of files) {
    // Get the path relative to basePath
    // e.g. "subjects/math/chapters/unit-1/lesson.md" → "unit-1/lesson.md"
    let relativePath = file.file_path;
    if (relativePath.startsWith(basePath + "/")) {
      relativePath = relativePath.slice(basePath.length + 1);
    } else if (relativePath.startsWith(basePath)) {
      relativePath = relativePath.slice(basePath.length);
    }

    const segments = relativePath.split("/").filter(Boolean);

    if (segments.length === 1) {
      // File at root level of this section
      root.push({
        name: segments[0].replace(/\.md$/, ""),
        path: file.file_path,
        isFolder: false,
        children: [],
        file,
      });
    } else {
      // File in a subfolder — ensure all parent folders exist
      let currentChildren = root;
      let currentPath = basePath;

      for (let i = 0; i < segments.length - 1; i++) {
        currentPath += "/" + segments[i];
        const iconKey = currentPath.replace(new RegExp(`^subjects/[^/]+/`), "");

        let folder = folderMap.get(currentPath);
        if (!folder) {
          folder = {
            name: segments[i],
            path: currentPath,
            isFolder: true,
            icon: folderIcons?.[iconKey],
            children: [],
          };
          folderMap.set(currentPath, folder);
          currentChildren.push(folder);
        }
        currentChildren = folder.children;
      }

      // Add the file as a leaf
      const fileName = segments[segments.length - 1];
      currentChildren.push({
        name: fileName.replace(/\.md$/, ""),
        path: file.file_path,
        isFolder: false,
        children: [],
        file,
      });
    }
  }

  // Sort: folders first (alphabetically), then files (alphabetically)
  sortTree(root);
  return root;
}

function sortTree(nodes: TreeNode[]): void {
  nodes.sort((a, b) => {
    if (a.isFolder && !b.isFolder) return -1;
    if (!a.isFolder && b.isFolder) return 1;
    return a.name.localeCompare(b.name);
  });
  for (const node of nodes) {
    if (node.children.length > 0) sortTree(node.children);
  }
}
