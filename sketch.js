let gl;
let texturedShader;
let model = null;

const vertexSrc = `#version 300 es
precision mediump float;

in vec3 position;
in vec3 inNormal;
in vec2 inTexcoord;

uniform mat4 model;
uniform mat4 view;
uniform mat4 proj;

out vec2 texcoord;
out vec3 vertNormal;
out vec3 pos;

void main() {
  texcoord = inTexcoord;
  mat3 normalMat = mat3(transpose(inverse(view * model)));
  vertNormal = normalize(normalMat * inNormal);
  pos = (view * model * vec4(position, 1.0)).xyz;
  gl_Position = proj * view * model * vec4(position, 1.0);
}
`;

const fragmentSrc = `#version 300 es
precision mediump float;

in vec3 vertNormal;
in vec3 pos;

uniform vec3 inColor;
uniform vec3 lightPos; 
uniform vec3 lightDir;    
uniform float ambient;     

out vec4 fragColor;

void main() {
  vec3 normal = normalize(vertNormal);
  vec3 L = normalize(lightPos - pos);
  float diff = max(dot(normal, L), 0.0);
  vec3 viewDir = normalize(-pos); 
  vec3 reflectDir = reflect(-L, normal);
  float spec = pow(max(dot(viewDir, reflectDir), 0.0), 16.0); //shininess 16
  vec3 color = inColor;
  vec3 diffuse = diff * color;
  vec3 specular = vec3(0.2) * spec; 
  vec3 ambientCol = color * ambient;
  vec3 finalColor = ambientCol + diffuse + specular;
  fragColor = vec4(finalColor, 1.0);
}
`;

async function setup() {
  createCanvas(windowWidth, windowHeight, WEBGL);
  gl = drawingContext; //grab the WebGL context from p5.js
  texturedShader = initShader(vertexSrc, fragmentSrc);

  const platform = await loadTxtModel("models/platform.txt");
  const player = await loadTxtModel("models/player.txt");
  const models = { platform, player };

  const { buffer, modelData } = loadAllModels(models);
  const vao = createVAO(buffer, texturedShader); //create VAO to load all the vertex attributes (postion, texture coords, normals)
  model = { vao, modelData }; //save the vao and data for each model for rendering
}

function draw() {
  background(220); //default background

  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); //clear the screen to default color
  gl.enable(gl.DEPTH_TEST);
  gl.viewport(0, 0, width, height);

  if (!model) return;
  gl.useProgram(texturedShader);
  gl.bindVertexArray(model.vao);

  //projection matrix
  const proj = glMatrix.mat4.create();
  const FOV = (45 * Math.PI) / 180;
  glMatrix.mat4.perspective(proj, FOV, width / height, 0.1, 50.0);

  //view matrix (camera)
  const view = glMatrix.mat4.create();
  glMatrix.mat4.lookAt(
    view,
    [0, 5, 10], //camera position
    [0, 0, 0], //look at
    [0, 1, 0] //up
  );

  //grab the model, view, projection, and color
  const uniModel = gl.getUniformLocation(texturedShader, "model");
  const uniView = gl.getUniformLocation(texturedShader, "view");
  const uniProj = gl.getUniformLocation(texturedShader, "proj");
  const uniColor = gl.getUniformLocation(texturedShader, "inColor");

  //upload the view and projection matrix
  gl.uniformMatrix4fv(uniView, false, view);
  gl.uniformMatrix4fv(uniProj, false, proj);

  //draw the platform
  const modelPlatform = glMatrix.mat4.create();
  glMatrix.mat4.translate(modelPlatform, modelPlatform, [-6, -4, 0]);
  glMatrix.mat4.scale(modelPlatform, modelPlatform, [10, 4, 1]);
  gl.uniform3fv(uniColor, [0.25, 0.25, 0.25]); //dark gray

  //position platform based on map position
  gl.uniformMatrix4fv(uniModel, false, modelPlatform);
  const platformSec = model.modelData.platform;
  gl.drawArrays(gl.TRIANGLES, platformSec.start, platformSec.count);

  //draw player
  const modelPlayer = glMatrix.mat4.create();
  glMatrix.mat4.translate(modelPlayer, modelPlayer, [-2, -1.5, 0]);
  glMatrix.mat4.scale(modelPlayer, modelPlayer, [1, 1, 1]);
  gl.uniform3fv(uniColor, [0.8, 0.3, 0.4]); //pink

  //position player based on map position
  gl.uniformMatrix4fv(uniModel, false, modelPlayer);
  const playerSec = model.modelData.player;
  gl.drawArrays(gl.TRIANGLES, playerSec.start, playerSec.count);

  gl.bindVertexArray(null);
}

async function loadTxtModel(filename) {
  const file = await fetch(filename);
  const text = await file.text();

  const allLines = text.split(/\n/);
  const numLines = parseInt(allLines[0].trim());
  const modelData = [];

  //parse the .txt file to get vertex’s X, Y, and Z position; the U, V texture coords; and the X, Y, and Z vertex norms
  for (let i = 1; i <= numLines; i++) {
    const trimmedLine = allLines[i].trim();
    if (trimmedLine.length > 0) {
      modelData.push(parseFloat(trimmedLine));
    }
  }
  const vertices = new Float32Array(modelData);
  const numVerts = numLines / 8;
  return { vertices, numVerts };
}

function loadAllModels(models) {
  //get total number of vertexs for each model .txt file
  let totalVerts = 0;
  for (const model in models) {
    totalVerts += models[model].vertices.length;
  }
  //concatenate the models into one big array
  const modelData = {};
  const buffer = new Float32Array(totalVerts);
  let offset = 0;
  for (const model in models) {
    //loop over each model (platform and player)
    const modelObj = models[model];
    modelData[model] = {
      //save each models start vertex and number of vertices
      start: offset / 8,
      count: modelObj.numVerts,
    };
    let modelVert = modelObj.vertices.length;
    for (let i = 0; i < modelVert; i++) {
      buffer[offset + i] = modelObj.vertices[i]; //store the model in the buffer
    }
    offset += modelVert; //update the offset to the start of the next model's data
  }
  return { buffer, modelData };
}

function createVAO(buffer, texturedShader) {
  const vao = gl.createVertexArray(); //create VAO
  gl.bindVertexArray(vao); //bind the VAO to the current context

  const vbo = gl.createBuffer(); //create vbo buffer
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo); //set vbo as the active array buffer
  gl.bufferData(gl.ARRAY_BUFFER, buffer, gl.STATIC_DRAW); //upload buffer to the vbo
  const stride = 8 * 4; //8 vertices; 4 is the size of a float

  //Tell WebGL how to set fragment shader input
  const posAttrib = gl.getAttribLocation(texturedShader, "position");
  gl.vertexAttribPointer(posAttrib, 3, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(posAttrib);

  const texAttrib = gl.getAttribLocation(texturedShader, "inTexcoord");
  gl.vertexAttribPointer(texAttrib, 2, gl.FLOAT, false, stride, 3 * 4);
  gl.enableVertexAttribArray(texAttrib);

  const normAttrib = gl.getAttribLocation(texturedShader, "inNormal");
  gl.vertexAttribPointer(normAttrib, 3, gl.FLOAT, false, stride, 5 * 4);
  gl.enableVertexAttribArray(normAttrib, 3, gl.FLOAT, false, stride, 5 * 4);

  gl.bindVertexArray(null); //unbind to accidentally avoid modifying it
  return vao;
}

//adaptation of initShader from project4 code: creates a GLSL program object from vertex and fragment shader
function initShader(vertexSrc, fragmentSrc) {
  const vertexShader = gl.createShader(gl.VERTEX_SHADER);
  const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);

  //load vertex shader
  gl.shaderSource(vertexShader, vertexSrc);
  gl.compileShader(vertexShader);
  if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS))
    console.error("Vertex shader error:", gl.getShaderInfoLog(vertexShader));

  //load fragment shader
  gl.shaderSource(fragmentShader, fragmentSrc);
  gl.compileShader(fragmentShader);
  if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS))
    console.error("Fragment shader error:",gl.getShaderInfoLog(fragmentShader));

  //create the program
  const program = gl.createProgram();

  //attach shaders to program
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);

  //link and set program to use
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS))
    console.error("Program link error:", gl.getProgramInfoLog(program));

  return program;
}
