const output = document.querySelector(".js-output");
const totalEstimatedElement = document.querySelector(".js-totalestimated");
const totalSpentElement = document.querySelector(".js-totalspent");

export function prefillData(formElement, useSampleData = false, inputString) {
  const textArea = formElement.querySelector("textarea");

  if (!useSampleData) {
    textArea.value = inputString;
  } else {
    textArea.value = `Tomatoes:2 pieces::$1:::Produce::::Turkey Flautas
Tortillas:1 package::$5:::Aisles::::Turkey Flautas
Cereal:1 box::$5:::Aisles::::Pantry
Bread:1 loaf::$5:::Aisles::::Pantry
Eggs:2 dozen::$7:::Refrigerated::::Pantry
Bananas:1 bundle::$3:::Produce::::Pantry
Mexican Cheese:1 package::$5:::Refrigerated::::Turkey Flautas`;
  }
}

export function transformInput(inputString) {
  const itemsRaw = inputString.split("\n");
  const items = itemsRaw.reduce((acc, rawItem) => {
    if (rawItem.trim() === "" || rawItem.trim().startsWith("//")) return acc;

    const mealParts = rawItem.split("::::");
    const meal = mealParts[1].trim();

    const categoryParts = mealParts[0].split(":::");
    const category = categoryParts[1].trim();

    const priceParts = categoryParts[0].split("::");
    const price = priceParts[1].trim();

    const qtyParts = priceParts[0].split(":");
    const qty = qtyParts[1].trim();

    const item = qtyParts[0].trim();

    if (!acc[category]) {
      acc[category] = {
        items: [
          {
            name: item,
            qty: qty,
            price: price,
            meal: meal,
          },
        ],
      };
    } else {
      acc[category].items.push({
        name: item,
        qty: qty,
        price: price,
        meal: meal,
      });
    }
    // console.log('acc', acc);
    return acc;
  }, {});
  const content = convertToShoppingList(items);
  output.innerHTML = "";
  output.appendChild(content);
}

export function convertToShoppingList(itemCategories) {
  totalEstimatedElement.innerText = "";
  totalSpentElement.innerText = "";
  let totalEstimate = 0;
  let totalSpent = 0;
  const formattedOutputList = Object.keys(itemCategories).map(
    (itemCategory) => {
      const section = document.createElement("section");
      const sectionTitle = document.createElement("h2");
      let categoryCost = 0;

      const ul = document.createElement("ul");
      itemCategories[itemCategory].items.forEach((item) => {
        const itemCost = calculateCost(item);
        totalEstimate += itemCost;
        categoryCost += itemCost;
        totalEstimatedElement.innerText = `$${totalEstimate} estimated `;

        sectionTitle.innerText = `${itemCategory} ($${categoryCost})`;

        const itemId = `groceryItem-${itemCategory}-${item.name}`;
        const li = document.createElement("li");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.id = itemId;
        checkbox.name = itemId;
        checkbox.addEventListener("change", (e) => {
          if (e.target.checked) {
            totalSpent += itemCost;
          } else {
            totalSpent -= itemCost;
          }
          totalSpentElement.innerText = `- $${totalSpent} spent = $${
            totalEstimate - totalSpent
          } remaining`;
        });
        const label = document.createElement("label");
        label.innerText = `${item.name} (${item.qty} @ ${item.price})`;
        label.htmlFor = itemId;
        const span = document.createElement("span");
        span.innerText = `for ${item.meal}`;
        span.classList.add("js-meal");
        label.appendChild(span);
        li.appendChild(checkbox);
        li.appendChild(label);
        ul.appendChild(li);
      });
      section.appendChild(sectionTitle);
      section.appendChild(ul);
      return section;
    }
  );
  const article = document.createElement("article");
  formattedOutputList.forEach((listItem) => {
    article.appendChild(listItem);
  });

  return article;
}

export function getPrice(inputString) {
  // Remove non-numeric characters (except decimal point)
  const numericString = inputString.replace(/[^0-9.]/g, "");

  // Parse the numeric string
  const price = parseFloat(numericString);

  return price;
}

export function calculateCost(item) {
  const qty = parseFloat(item.qty);
  const price = getPrice(item.price);
  return price * qty;
}
