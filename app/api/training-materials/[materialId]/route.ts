import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

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
    const supabase = await createServerSupabaseClient()
    
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