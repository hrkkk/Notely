import { untitledName } from "../constants";

function getNameFromPath(path: string) {
  return path.split(/[\\/]/).pop() || untitledName;
}

function getExtension(name: string) {
  const extension = name.includes(".") ? name.split(".").pop()?.toLowerCase() : "";
  return extension || "";
}

export { getNameFromPath, getExtension };
