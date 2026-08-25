def maybe_find(x):
    if x == 5:
        return "found it!"
    return None

items = [1, 2, 5, 8]

for item in items:
    result = maybe_find(item)
    if result is not None:
        return result