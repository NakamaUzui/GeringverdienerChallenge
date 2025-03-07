const body = document.querySelector("body"),
    sidebar = body.querySelector(".sidebar"),
    toggle = body.querySelector(".toggle"),
    modeSwitch = body.querySelector(".toggle-switch"),
    modeText = body.querySelector(".mode-text");

// Load saved sidebar state
if (localStorage.getItem("sidebar-state") === "closed") {
    sidebar.classList.add("close");
} else {
    sidebar.classList.remove("close");
}

toggle.addEventListener("click", () => {
    sidebar.classList.toggle("close");
    // Save sidebar state
    localStorage.setItem("sidebar-state", sidebar.classList.contains("close") ? "closed" : "open");
});

modeSwitch.addEventListener("click", () => {
    body.classList.toggle("dark");
    
    if(body.classList.contains("dark")){
        modeText.innerText = "Light Mode";
        localStorage.setItem("dark-mode", "true");
    } else {
        modeText.innerText = "Dark Mode";
        localStorage.setItem("dark-mode", "false");
    }
});

// Load saved dark mode preference
if (localStorage.getItem("dark-mode") === "true") {
    body.classList.add("dark");
    modeText.innerText = "Light Mode";
}
