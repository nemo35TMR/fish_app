import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  connect() {
    this.scroll()

    this.observer = new MutationObserver(() => {
      this.scroll()
    })

    this.observer.observe(this.element, {
      childList: true,
      subtree: true
    })
  }

  disconnect() {
    if (this.observer) {
      this.observer.disconnect()
    }
  }

  scroll() {
    this.element.scrollTop = this.element.scrollHeight
  }
}
