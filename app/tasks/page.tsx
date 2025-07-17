import AddTaskForm from '@/components/AddTaskForm'
import { getUserTasks } from '@/lib/database'
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function TasksPage() {
  const { userId } = await auth();
  
  if (!userId) {
    redirect("/auth/login");
  }

  // Get tasks for the authenticated user
  const tasks = await getUserTasks(userId)

  return (
    <div className="max-w-4xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-8">Tasks</h1>
      
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Your Tasks</h2>
        <div className="space-y-2">
          {tasks.map((task) => (
            <div key={task.id} className="p-4 border rounded-lg">
              <p>{task.name}</p>
              <p className="text-sm text-gray-500">
                Created: {new Date(task.created_at).toLocaleDateString()}
              </p>
            </div>
          ))}
          {tasks.length === 0 && (
            <p className="text-gray-500">No tasks yet. Add one below!</p>
          )}
        </div>
      </div>

      <AddTaskForm />
    </div>
  );
}