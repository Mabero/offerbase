import { supabase } from '../supabaseClient';

export async function searchLinks(query, userId, siteId) {
  try {
    // Search for links based on the query
    const { data, error } = await supabase
      .from('affiliate_links')
      .select('*')
      .eq('user_id', userId)
      .eq('site_id', siteId)
      .textSearch('keywords', query)
      .limit(5);

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error searching links:', error);
    throw error;
  }
}

export async function getChatResponse(message, userId, siteId) {
  try {
    // Search for relevant links
    const links = await searchLinks(message, userId, siteId);
    
    // Generate a response based on the found links
    if (links && links.length > 0) {
      const response = {
        type: 'links',
        message: 'Here are some relevant products you might be interested in:',
        links: links.map(link => ({
          name: link.name,
          url: link.url,
          description: link.description,
          image_url: link.image_url
        }))
      };
      return response;
    }

    // Default response if no links are found
    return {
      type: 'message',
      message: "I couldn't find any relevant products. Could you please provide more details about what you're looking for?"
    };
  } catch (error) {
    console.error('Error generating chat response:', error);
    throw error;
  }
}