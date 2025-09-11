## Simple mental model (when to select await and when not)

* Actions on the page → always await (goto, click, fill, type, wait).

* Getting values → await (textContent, inputValue, attributes).

* Creating locators → no await (page.locator, page.getByRole).

* Assertions → usually await when checking visibility/conditions.