import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createSupabaseAdminClient } from '@/lib/supabase-server'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ materialId: string }> }
) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { materialId } = await context.params
    const supabase = createSupabaseAdminClient()
    
    // Get the material and verify ownership
    const { data: material, error } = await supabase
      .from('training_materials')
      .select(`
        *,
        sites!inner (
          user_id
        )
      `)
      .eq('id', materialId)
      .eq('sites.user_id', userId)
      .single()

    if (error || !material) {
      console.error('Material access check failed:', error)
      return NextResponse.json({ error: 'Training material not found or unauthorized' }, { status: 404 })
    }

    return NextResponse.json({ material })
  } catch (error) {
    console.error('Error in GET /api/training-materials/[materialId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ materialId: string }> }
) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { materialId } = await context.params
    const body = await request.json()
    const { title, content, content_type, metadata } = body

    console.log('Updating training material:', { materialId, userId, hasContent: !!content })

    const supabase = createSupabaseAdminClient()
    
    // First verify the material belongs to the user (through site ownership)
    const { data: material, error: materialError } = await supabase
      .from('training_materials')
      .select(`
        *,
        sites!inner (
          user_id
        )
      `)
      .eq('id', materialId)
      .eq('sites.user_id', userId)
      .single()

    if (materialError || !material) {
      console.error('Material access check failed:', materialError)
      return NextResponse.json({ error: 'Training material not found or unauthorized' }, { status: 404 })
    }

    // Update the training material
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString()
    }

    if (title !== undefined) updates.title = title
    if (content !== undefined) updates.content = content
    if (content_type !== undefined) updates.content_type = content_type
    if (metadata !== undefined) updates.metadata = metadata

    // If content is being updated, mark as manually updated
    if (content !== undefined) {
      updates.scrape_status = 'success'
      updates.last_scraped_at = new Date().toISOString()
    }

    const { data: updatedMaterial, error: updateError } = await supabase
      .from('training_materials')
      .update(updates)
      .eq('id', materialId)
      .select('*')
      .single()

    if (updateError) {
      console.error('Error updating training material:', updateError)
      return NextResponse.json({ error: 'Failed to update training material' }, { status: 500 })
    }

    console.log('Training material updated successfully:', updatedMaterial.id)
    return NextResponse.json({ material: updatedMaterial })

  } catch (error) {
    console.error('Error in PUT /api/training-materials/[materialId]:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ materialId: string }> }
) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { materialId } = await context.params
    const supabase = createSupabaseAdminClient()
    
    // First verify the material belongs to the user (through site ownership)
    const { data: material, error: materialError } = await supabase
      .from('training_materials')
      .select(`
        id,
        sites!inner (
          id,
          user_id
        )
      `)
      .eq('id', materialId)
      .eq('sites.user_id', userId)
      .single()

    if (materialError || !material) {
      return NextResponse.json({ error: 'Material not found or unauthorized' }, { status: 404 })
    }

    // Delete the material
    const { error } = await supabase
      .from('training_materials')
      .delete()
      .eq('id', materialId)

    if (error) {
      console.error('Error deleting training material:', error)
      return NextResponse.json({ error: 'Failed to delete training material' }, { status: 500 })
    }

    return NextResponse.json({ message: 'Material deleted successfully' })
  } catch (error) {
    console.error('Error in DELETE /api/training-materials/[materialId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}