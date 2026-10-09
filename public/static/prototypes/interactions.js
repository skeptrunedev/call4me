(() => {
  document.querySelectorAll(".copy-prompt").forEach((button) => {
    const text = document.getElementById(button.dataset.target);
    const idle = button.textContent;
    button.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(text.value);
        button.textContent = "copied, paste it into your agent";
      } catch {
        text.focus();
        text.select();
        button.textContent = "select and copy the prompt below";
      }
      setTimeout(() => {
        button.textContent = idle;
      }, 3000);
    });
  });
})();
