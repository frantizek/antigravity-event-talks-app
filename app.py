import xml.etree.ElementTree as ET
import datetime
from flask import Flask, jsonify, render_template
import requests

app = Flask(__name__)

FEED_URL = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"

# Helper to format XML date string into a nice readable date
def parse_date(date_str):
    try:
        # Expected format: "2026-06-17T00:00:00-07:00"
        # We can slice it to get "2026-06-17"
        dt = datetime.datetime.strptime(date_str[:10], "%Y-%m-%d")
        return dt.strftime("%B %d, %Y")
    except Exception:
        return date_str

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/release-notes")
def get_release_notes():
    try:
        response = requests.get(FEED_URL, timeout=10)
        response.raise_for_status()
        
        # Parse XML
        root = ET.fromstring(response.content)
        ns = {"atom": "http://www.w3.org/2005/Atom"}
        
        entries = []
        for entry in root.findall("atom:entry", ns):
            title = entry.find("atom:title", ns)
            title_text = title.text if title is not None else ""
            
            updated = entry.find("atom:updated", ns)
            updated_text = updated.text if updated is not None else ""
            
            link = entry.find("atom:link", ns)
            link_href = link.attrib.get("href") if link is not None else ""
            
            content = entry.find("atom:content", ns)
            content_html = content.text if content is not None else ""
            
            id_elem = entry.find("atom:id", ns)
            id_text = id_elem.text if id_elem is not None else ""
            
            entries.append({
                "id": id_text,
                "title": title_text,
                "raw_date": updated_text,
                "formatted_date": parse_date(updated_text),
                "link": link_href,
                "content": content_html
            })
            
        return jsonify({
            "status": "success",
            "count": len(entries),
            "data": entries
        })
        
    except requests.exceptions.RequestException as e:
        return jsonify({
            "status": "error",
            "message": f"Failed to fetch release notes feed: {str(e)}"
        }), 500
    except ET.ParseError as e:
        return jsonify({
            "status": "error",
            "message": f"Failed to parse XML feed: {str(e)}"
        }), 500
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": f"An unexpected error occurred: {str(e)}"
        }), 500

if __name__ == "__main__":
    app.run(debug=True, port=5000)
