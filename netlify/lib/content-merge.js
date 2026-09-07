"use strict";

const MISSING = Symbol("missing");

class MergeConflictError extends Error {
  constructor(paths) {
    const unique = [...new Set(paths)].slice(0, 20);
    super("Another admin changed the same field. Reload the dashboard and review: " + unique.join(", "));
    this.name = "MergeConflictError";
    this.statusCode = 409;
    this.paths = unique;
  }
}

function clone(value) {
  return value === MISSING ? MISSING : JSON.parse(JSON.stringify(value));
}

function same(left, right) {
  if (left === MISSING || right === MISSING) return left === right;
  return JSON.stringify(left) === JSON.stringify(right);
}

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function identityField(groups) {
  return ["id", "number", "ownerKey", "title"].find((field) => groups.every((group) => {
    const values = group.map((item) => isObject(item) && item[field]).filter((value) => value !== undefined && value !== null);
    return values.length === group.length && new Set(values.map(String)).size === values.length;
  })) || null;
}

function mergePrimitiveArray(base, incoming, current) {
  const serialize = (item) => JSON.stringify(item);
  const baseSet = new Set(base.map(serialize));
  const incomingSet = new Set(incoming.map(serialize));
  const result = current.filter((item) => !(baseSet.has(serialize(item)) && !incomingSet.has(serialize(item))));
  const resultSet = new Set(result.map(serialize));
  incoming.forEach((item) => {
    const key = serialize(item);
    if (!baseSet.has(key) && !resultSet.has(key)) {
      result.push(clone(item));
      resultSet.add(key);
    }
  });
  return result;
}

function mergeValue(base, incoming, current, path, conflicts) {
  if (same(incoming, base)) return clone(current);
  if (same(current, base) || same(incoming, current)) return clone(incoming);

  if (isObject(base) && isObject(incoming) && isObject(current)) {
    const result = {};
    const keys = new Set([...Object.keys(base), ...Object.keys(incoming), ...Object.keys(current)]);
    keys.forEach((key) => {
      const value = mergeValue(
        Object.prototype.hasOwnProperty.call(base, key) ? base[key] : MISSING,
        Object.prototype.hasOwnProperty.call(incoming, key) ? incoming[key] : MISSING,
        Object.prototype.hasOwnProperty.call(current, key) ? current[key] : MISSING,
        path ? path + "." + key : key,
        conflicts
      );
      if (value !== MISSING) result[key] = value;
    });
    return result;
  }

  if (Array.isArray(base) && Array.isArray(incoming) && Array.isArray(current)) {
    const identity = identityField([base, incoming, current]);
    if (!identity) return mergePrimitiveArray(base, incoming, current);
    const baseMap = new Map(base.map((item) => [String(item[identity]), item]));
    const incomingMap = new Map(incoming.map((item) => [String(item[identity]), item]));
    const currentMap = new Map(current.map((item) => [String(item[identity]), item]));
    const order = [...currentMap.keys(), ...incomingMap.keys().filter((key) => !currentMap.has(key))];
    const result = [];
    order.forEach((key) => {
      const value = mergeValue(
        baseMap.has(key) ? baseMap.get(key) : MISSING,
        incomingMap.has(key) ? incomingMap.get(key) : MISSING,
        currentMap.has(key) ? currentMap.get(key) : MISSING,
        path + "[" + identity + "=" + key + "]",
        conflicts
      );
      if (value !== MISSING) result.push(value);
    });
    return result;
  }

  conflicts.push(path || "content");
  return clone(current);
}

function mergeContent(base, incoming, current) {
  const conflicts = [];
  const merged = mergeValue(base, incoming, current, "", conflicts);
  if (conflicts.length) throw new MergeConflictError(conflicts);
  return merged;
}

module.exports = { MergeConflictError, mergeContent };
