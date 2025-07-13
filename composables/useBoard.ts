import { NodeType, type BaseNode, type DocumentNode } from "sciux"
import type { ChatInfo } from "."
import type { Step } from "~/types/design"
import { chat } from "~/endpoint"
import type { ChalkResult } from "~/types"

export const PAGE = Symbol('PAGE')
export const VIEWING = Symbol('VIEWING')
export const TOTAL = Symbol('TOTAL')

export const PAGES = Symbol('PAGES')
export const ACTIVE_TARGET = Symbol('ACTIVE_TARGET')

export interface Page {
  title: string
  document: DocumentNode
}

function createEmptyDocument(id: number) {
  return {
    type: NodeType.DOCUMENT,
    children: [
      {
        type: NodeType.ELEMENT,
        tag: 'root',
        children: [],
        selfClosing: false,
        attributes: [],
      },
    ],
    filename: `page-${id}`,
    raw: '',
  } as DocumentNode
}

export default function useBoard(info: ChatInfo) {
  let unused = 0
  const pages = new Map<number, Page>()

  // PageId: The current page id LLM is working on
  const pageId = ref<number | null>(null)
  // ViewingId: The page id that is currently visible to the user
  const viewingId = ref<number | null>(null)

  const activeDocument = ref<DocumentNode>()
  const total = ref<number>(0)
  const activeTarget = ref<BaseNode>()

  provide(PAGES, pages)
  provide(PAGE, pageId)
  provide(VIEWING, viewingId)
  provide(TOTAL, total)
  provide(ACTIVE_TARGET, activeTarget)
  // The view of user is always follow the page id LLM is working on,
  // But when LLM has no new operation, the user was be allowed to switch to other page.
  watch(pageId, (id) => {
    if (id) {
      viewingId.value = id
      // activeDocument.value = pages.get(id)!.document
    }
  })

  function createPage(title: string, autoSwitch = true, givenId?: number) {
    unused++
    const id = givenId ?? unused
    pages.set(id, { title, document: createEmptyDocument(id) })
    pageId.value = id
    if (autoSwitch) {
      total.value++
    }
    activeDocument.value = pages.get(id)!.document
    return id
  }

  function initialize() {
    createPage('PRIMARY')
    viewingId.value = pageId.value
    activeDocument.value = pages.get(pageId.value!)!.document
  }

  function switchViewing(operation: 'next' | 'previous'): number
  function switchViewing(operation: number): void
  function switchViewing(operation: unknown): number | void {
    if (typeof operation === 'number') {
      viewingId.value = operation
    } else if (operation === 'next') {
      viewingId.value = (viewingId.value! + 1) % pages.size
      return viewingId.value
    } else if (operation === 'previous') {
      viewingId.value = (viewingId.value! - 1 + pages.size) % pages.size
      return viewingId.value
    }
  }

  const { handleOperation } = useOperator(activeDocument, (node) => {
    activeTarget.value = node
  })

  async function next(step: Step, prompt: string) {
    const { content } = await chat.layout({
      chat_id: info.chat_id,
      step,
      prompt,
      page_id: pageId.value?.toString() ?? '',
      page_id_will_be_used: (unused + 1).toString(),
    }, {
      onOperate: (operation) => {
        if (operation.type === 'switch-page') {
          pageId.value = parseInt(operation.pageId)
        } else if (operation.type === 'add-page') {
          createPage(operation.title)
        }
      }
    }, info.token)
    await chat.chalk({
      chat_id: info.chat_id,
      layout: content ?? '',
      step: step.step,
      page_id: pageId.value?.toString(),
      components: [],
      document: '',
      stream: true,
    }, {
      onOperate: (operation) => {
        const result = handleOperation(operation)
        console.log(result, activeDocument.value)
      }
    }, info.token)
  }

  async function apply(result: ChalkResult[]) {
    const { handleOperation: handle } = useOperator(activeDocument)
    for (const r of result) {
      const id = parseInt(r.page)
      const length = pages.size
      let has = false
      if (!pages.has(id)) {
        createPage(r.page, false, id)
        has = false
      } else {
        has = true
      }
      console.log('before', activeDocument.value, total.value, pageId.value)
      for (const op of r.output) {
        handle(op)
      }
      if (!has) {
        total.value += id - length
      }
      console.log('after', activeDocument.value, total.value, pageId.value)
    }
  }

  return {
    pageId,
    viewingId,
    initialize,
    createPage,
    next,
    switchViewing,
    apply,
  }
}