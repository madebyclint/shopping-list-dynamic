import * as functions from "./functions.js";

const myForm = document.querySelector(".js-form");

// 1. Check for rawText in search params
const searchParams = new URLSearchParams(window.location.search);
const rawText = searchParams.get("rawText");
if (rawText !== "") {
  functions.prefillData(myForm, false, rawText);
} else {
  // functions.prefillData(myForm, true);
}

// 2. Add event listener to form
console.log(rawText);
if (rawText && rawText !== "") {
  functions.transformInput(rawText);
} else {
  myForm.classList.remove("collapsed");
}

// 3. Add event listener to edit button
const editButton = document.querySelector(".js-edit");
editButton.addEventListener("click", () => {
  myForm.classList.toggle("collapsed");
  editButton.innerText = myForm.classList.contains("collapsed")
    ? "Edit"
    : "Close";

  if (myForm.classList.contains("collapsed")) {
    myForm.submit();
  }
});
