pipeline {
  agent any
  environment {
    AWS_REGION = 'ap-south-1'
    ECR_REGISTRY = '123456789012.dkr.ecr.ap-south-1.amazonaws.com'   // change me
    IMAGE = "${ECR_REGISTRY}/cloudnative-demo"
    TAG = "${env.GIT_COMMIT}"
  }
  stages {
    stage('Checkout') { steps { checkout scm } }
    stage('Install & Test') {
      steps { dir('app') { sh 'npm ci && npm test' } }
    }
    stage('Docker Build') {
      steps { sh 'docker build -t $IMAGE:$TAG ./app' }
    }
    stage('Trivy Scan') {
      steps { sh 'trivy image --severity HIGH,CRITICAL --ignore-unfixed --exit-code 1 $IMAGE:$TAG' }
    }
    stage('Publish to ECR') {
      when { branch 'main' }
      steps {
        withCredentials([[$class: 'AmazonWebServicesCredentialsBinding', credentialsId: 'aws-creds']]) {
          sh '''
            aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_REGISTRY
            docker push $IMAGE:$TAG
          '''
        }
      }
    }
    stage('Update GitOps Config') {
      when { branch 'main' }
      steps {
        sh '''
          sed -i "s|^  tag:.*|  tag: \\"$TAG\\"|" helm/cloudnative-demo/values-prod.yaml
          git config user.email "jenkins@example.com"; git config user.name "jenkins"
          git commit -am "jenkins: deploy $TAG" && git push origin HEAD:main
        '''
      }
    }
  }
}
