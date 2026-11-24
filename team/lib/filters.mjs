// Deterministic pre-filter: drop reviewer chatter that cannot be a checkable finding, before any model sees it.
const CHATTER = /^(lgtm|looks good( to me)?|\+1|👍|ship it|approved?|thanks?( you)?|thx|nice( one)?|great|done|fixed|ok(ay)?|ack|sgtm|nit:? ?(thanks|ok))[.! ]*$/i;

export function substantive(comments, { minChars = 15 } = {}) {
  return comments.filter(c => {
    const t = c.body.replace(/```[\s\S]*?```/g, ' ').replace(/\s+/g, ' ').trim();
    if (t.length < minChars && !c.path) return false;
    if (CHATTER.test(t)) return false;
    return t.length >= 8;
  });
}
