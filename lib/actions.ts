'use server'

import { createTask } from './database'
import { auth } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'

export async function addTask(name: string) {
  try {
    const { userId } = await auth()
    
    if (!userId) {
      throw new Error('Unauthorized')
    }

    const task = await createTask(name, userId)
    
    console.log('Task successfully added!', task)
    
    // Revalidate the tasks page to show the new task
    revalidatePath('/tasks')
    
    return { success: true, data: task }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('Error adding task:', errorMessage)
    throw new Error('Failed to add task')
  }
}