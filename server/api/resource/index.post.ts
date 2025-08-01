import { ResourceUploadRequestBody, ResourceUploadResponse } from "~/types/resource"
import db, { resource } from "~/db"
import { getUserId } from "~/utils/tool"

export const config = {
  runtime: 'edge'
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event) as ResourceUploadRequestBody
  const userId = getUserId(event)

  const [result] = await db.insert(resource)
    .values({
      type: body.type,
      name: body.name,
      tags: body.tags,
      author: body.author,
      author_id: userId,
      description: body.description,
      readme: body.readme,
      sources: body.sources,
      sections: body.sections,
    })
    .returning({ id: resource.id })
  return {
    id: result.id,
  } satisfies ResourceUploadResponse
})