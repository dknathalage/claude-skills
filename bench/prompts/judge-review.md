You compare a code review draft against a checklist of issues that human reviewers actually raised.

For each checklist item, decide whether any numbered draft comment raises the same issue: the same problem about the same code, not merely the same topic. Return the draft comment's number, or null if none does. One draft comment may satisfy several items.

Count the draft's numbered comments. For each draft comment that matches no checklist item, say whether it is plausibly a real issue in the diff (plausible: true) or noise, wrong or generic advice (plausible: false). You cannot see the diff, so mark plausible only when the comment names a specific, believable problem.
