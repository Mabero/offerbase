# Inline Widget WordPress Integration Guide

## Method 1: Direct Script Tag (Recommended)

Add this HTML to your WordPress post/page using the HTML block or Custom HTML widget:

```html
<script 
  src="https://your-domain.com/widget.js" 
  data-site-id="YOUR_SITE_ID" 
  data-widget-type="inline"
></script>
```

## Method 2: With Placeholder Container

If WordPress strips the script tag or it doesn't render properly, use this approach:

```html
<!-- Container for the widget -->
<div data-chat-widget-inline style="min-height: 600px;"></div>

<!-- Script at the end -->
<script 
  src="https://your-domain.com/widget.js" 
  data-site-id="YOUR_SITE_ID" 
  data-widget-type="inline"
></script>
```

## Method 3: WordPress Shortcode (if available)

If you have a custom shortcode plugin, you can create a shortcode:

```php
function inline_chat_widget_shortcode($atts) {
    $atts = shortcode_atts(array(
        'site_id' => '',
    ), $atts);
    
    return '<div data-chat-widget-inline style="min-height: 600px;"></div>
            <script src="https://your-domain.com/widget.js" 
                    data-site-id="' . esc_attr($atts['site_id']) . '" 
                    data-widget-type="inline"></script>';
}
add_shortcode('inline_chat', 'inline_chat_widget_shortcode');
```

Then use: `[inline_chat site_id="YOUR_SITE_ID"]`

## Debugging Steps

1. Open browser console (F12)
2. Look for console logs starting with "ChatWidget:"
3. Check for any error messages
4. Verify the script is loaded by checking: `window.ChatWidgetLoaded`

## Common Issues

1. **Script doesn't execute**: WordPress might be stripping script tags
   - Use a plugin like "Insert Headers and Footers" or "Code Snippets"
   - Use the Custom HTML block instead of the regular editor

2. **Widget appears at bottom of page**: The script can't find its parent element
   - Use Method 2 with the placeholder container

3. **CORS errors**: Make sure your domain is properly configured in the dashboard

4. **Widget doesn't show**: Check if there's a conflict with other JavaScript
   - Look for JavaScript errors in the console
   - Try disabling other plugins temporarily