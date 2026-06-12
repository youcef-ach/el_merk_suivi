import React, { useState, useEffect } from 'react';
import { searchSketchfab } from '../utils/sketchfabService';

const FurnitureCatalog = ({ onSelectFurniture, isPlacementMode }) => {
  const [localCatalog, setLocalCatalog] = useState([]);
  const [polyCatalog, setPolyCatalog] = useState([]);
  const [sketchfabCatalog, setSketchfabCatalog] = useState([]);
  
  const [source, setSource] = useState('Local');
  const [isOpen, setIsOpen] = useState(true);
  const [activeCategory, setActiveCategory] = useState('All');
  const [isLoading, setIsLoading] = useState(false);

  // Sketchfab State
  const sfToken = '3efcf5e532454a1ebf575a17c52ad614';
  const [sfSearchQuery, setSfSearchQuery] = useState('modern sofa');
  const [sfCursor, setSfCursor] = useState(null);
  const [sfHasMore, setSfHasMore] = useState(false);

  useEffect(() => {
    fetch('/furniture/catalog.json')
      .then(res => res.json())
      .then(data => setLocalCatalog(data))
      .catch(err => console.error('Failed to load local furniture catalog:', err));
  }, []);

  useEffect(() => {
    if (source === 'Poly Haven' && polyCatalog.length === 0) {
      setIsLoading(true);
      fetch('https://api.polyhaven.com/assets?type=models')
        .then(res => res.json())
        .then(data => {
          const validCategories = ['furniture', 'seating', 'table', 'appliances', 'shelves', 'bed'];
          const models = Object.entries(data)
            .map(([id, info]) => {
              const cat = info.categories.find(c => validCategories.includes(c));
              return {
                isPolyHaven: true,
                id: id,
                name: info.name,
                category: cat || 'other',
                thumbnail: info.thumbnail_url,
                polyHavenId: id
              };
            })
            .filter(item => item.category !== 'other');
          setPolyCatalog(models);
        })
        .catch(err => console.error('Failed to load Poly Haven catalog:', err))
        .finally(() => setIsLoading(false));
    }
  }, [source, polyCatalog.length]);

  useEffect(() => {
    setActiveCategory('All');
  }, [source]);

  const handleSfSearch = async (loadMore = false) => {
    if (!sfToken) return;
    setIsLoading(true);
    try {
      const currentCursor = loadMore ? sfCursor : null;
      const data = await searchSketchfab(sfSearchQuery, sfToken, currentCursor);
      
      const newModels = data.results.map(model => ({
        isSketchfab: true,
        id: model.uid,
        name: model.name,
        category: 'sketchfab', // Sketchfab search is keyword based, no strict categories
        thumbnail: model.thumbnails?.images?.[0]?.url || '',
        author: model.user?.username
      }));

      if (loadMore) {
        setSketchfabCatalog(prev => [...prev, ...newModels]);
      } else {
        setSketchfabCatalog(newModels);
      }
      
      setSfCursor(data.cursors?.next || null);
      setSfHasMore(!!data.cursors?.next);
      
    } catch (err) {
      console.error('Sketchfab search failed:', err);
      alert(err.message);
    } finally {
      setIsLoading(false);
    }
  };


  const currentCatalog = source === 'Local' ? localCatalog : source === 'Poly Haven' ? polyCatalog : sketchfabCatalog;
  const categories = source === 'Sketchfab' ? [] : ['All', ...new Set(currentCatalog.map(item => item.category))];
  const filteredCatalog = activeCategory === 'All' ? currentCatalog : currentCatalog.filter(item => item.category === activeCategory);

  return (
    <div className={`furniture-catalog ${isOpen ? 'open' : 'closed'}`}>
      <button className="toggle-btn" onClick={() => setIsOpen(!isOpen)}>
        {isOpen ? '◀' : '▶'} Catalog
      </button>

      {isOpen && (
        <div className="catalog-content" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <h2>Furniture Catalog</h2>

          <div style={{ display: 'flex', gap: '5px', marginBottom: '15px' }}>
            <button
              style={{ flex: 1, padding: '5px', background: source === 'Local' ? '#555' : '#333', color: 'white', border: '1px solid #666', cursor: 'pointer' }}
              onClick={() => setSource('Local')}
            >
              Local
            </button>
            <button
              style={{ flex: 1, padding: '5px', background: source === 'Poly Haven' ? '#555' : '#333', color: 'white', border: '1px solid #666', cursor: 'pointer' }}
              onClick={() => setSource('Poly Haven')}
            >
              Poly Haven
            </button>
            <button
              style={{ flex: 1, padding: '5px', background: source === 'Sketchfab' ? '#555' : '#333', color: 'white', border: '1px solid #666', cursor: 'pointer' }}
              onClick={() => setSource('Sketchfab')}
            >
              Sketchfab
            </button>
          </div>

          {source === 'Sketchfab' && (
            <div style={{ marginBottom: '15px', background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '8px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', gap: '5px' }}>
                  <input 
                    type="text" 
                    value={sfSearchQuery}
                    onChange={e => setSfSearchQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSfSearch(false)}
                    placeholder="Search modern furniture..."
                    style={{ flex: 1, padding: '5px', background: '#222', color: 'white', border: '1px solid #444' }}
                  />
                  <button onClick={() => handleSfSearch(false)} style={{ padding: '5px 10px', background: '#2196F3', color: 'white', border: 'none', cursor: 'pointer' }}>Search</button>
                </div>
              </div>
            </div>
          )}

          {source !== 'Sketchfab' && (
            <div className="category-tabs" style={{ display: 'flex', overflowX: 'auto', paddingBottom: '10px', marginBottom: '10px' }}>
              {categories.map(cat => (
                <button
                  key={cat}
                  className={`tab-btn ${activeCategory === cat ? 'active' : ''}`}
                  onClick={() => setActiveCategory(cat)}
                  style={{ flexShrink: 0, marginRight: '5px' }}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          <div className="item-grid" style={{ overflowY: 'auto', flex: 1, paddingRight: '10px' }}>
            {isLoading && !sfCursor && <div style={{ textAlign: 'center', padding: '20px' }}>Loading...</div>}

            {(!isLoading || sfCursor) && filteredCatalog.map(item => (
              <div key={item.id} className="item-card" style={{ marginBottom: '15px', background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '8px' }}>
                {(item.isPolyHaven || item.isSketchfab) ? (
                  <div 
                    className="item-preview" 
                    id={`preview-${item.id}`}
                    style={{ position: 'relative', height: '120px', width: '100%', borderRadius: '4px', marginBottom: '10px', backgroundColor: '#1a1a2e', overflow: 'hidden' }}
                  >
                    <img
                      id={`img-${item.id}`}
                      src={item.thumbnail}
                      alt={item.name}
                      referrerPolicy="no-referrer"
                      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                      onError={(e) => {
                        e.target.style.display = 'none';
                        e.target.parentElement.innerHTML = '<div style="color:red;font-size:12px;padding:10px;text-align:center;">Image blocked</div>';
                      }}
                    />
                    {/* Diagnostic Test Button - Only show on hover for debugging */}
                    <button 
                      style={{ position: 'absolute', bottom: 0, right: 0, fontSize: '10px', opacity: 0.5 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        const container = document.getElementById(`preview-${item.id}`);
                        const img = document.getElementById(`img-${item.id}`);
                        console.log(`[Diagnostic] ${item.name}:`);
                        console.log(`Container: height=${container.offsetHeight}px, clientHeight=${container.clientHeight}px`);
                        console.log(`Image: height=${img.offsetHeight}px, clientHeight=${img.clientHeight}px, natural=${img.naturalHeight}px`);
                      }}
                    >
                      Test
                    </button>
                  </div>
                ) : (
                  <div
                    className="item-preview"
                    style={{ backgroundColor: item.color, height: '120px', borderRadius: '4px', marginBottom: '10px' }}
                    title={`${item.name} (${item.type})`}
                  ></div>
                )}

                <div className="item-info" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span className="item-name" style={{ fontSize: '14px', fontWeight: 'bold' }}>{item.name}</span>
                      {item.author && <span style={{ fontSize: '10px', color: '#888' }}>by {item.author}</span>}
                    </div>
                    <button
                      className={`place-btn ${isPlacementMode ? 'disabled' : ''}`}
                      onClick={() => onSelectFurniture(item)}
                      disabled={isPlacementMode}
                      style={{ padding: '5px 10px', background: '#2196F3', color: 'white', border: 'none', borderRadius: '4px', cursor: isPlacementMode ? 'not-allowed' : 'pointer', opacity: isPlacementMode ? 0.5 : 1, flexShrink: 0, marginLeft: '10px' }}
                    >
                      Place
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {source === 'Sketchfab' && sfHasMore && (
              <button 
                onClick={() => handleSfSearch(true)}
                disabled={isLoading}
                style={{ width: '100%', padding: '10px', background: '#333', color: 'white', border: '1px solid #444', borderRadius: '4px', cursor: 'pointer', marginBottom: '20px' }}
              >
                {isLoading ? 'Loading...' : 'Load More'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default FurnitureCatalog;
