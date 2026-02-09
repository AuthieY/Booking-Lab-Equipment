/**
 * Apply Firestore doc changes to an existing array state by document id.
 * This avoids rebuilding the whole list on every snapshot update.
 */
export const applyDocChanges = (previousItems = [], changes = []) => {
  const byId = new Map(previousItems.map((item) => [item.id, item]));

  changes.forEach((change) => {
    const id = change.doc.id;
    if (change.type === 'removed') {
      byId.delete(id);
      return;
    }
    byId.set(id, { id, ...change.doc.data() });
  });

  return Array.from(byId.values());
};
